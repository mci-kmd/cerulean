import type { AdoClient } from "./ado-client";
import type {
    AdoCurrentUser,
    AdoBuild,
    AdoPolicyEvaluationRecord,
    AdoPullRequest,
    AdoRelease,
    AdoResourceRef,
    AdoPullRequestThread,
    AdoWorkItem,
    AdoWorkItemRelation,
  } from "@/types/ado";
  import type {
    PullRequestMergedBuildSummary,
    PullRequestMergedReleaseSummary,
    RelatedPullRequest,
    WorkItem,
  } from "@/types/board";
import { createSyntheticNegativeId } from "@/lib/create-synthetic-id";
import { CUSTOM_TASK_TYPE } from "@/lib/work-item-types";
import { hasAdoTag, parseAdoTags } from "@/lib/ado-tags";
import {
  buildWiqlQuery,
  buildCompletedWiqlQuery,
  buildTagWiqlQuery,
  buildCandidateWiqlQuery,
  buildCandidateBoardWiqlQuery,
  buildBoardColumnWiqlQuery,
  buildBoardColumnsWiqlQuery,
} from "./wiql";
import {
  type CandidateBoardConfig,
} from "@/lib/ado-board";
import { detectChanges } from "@/logic/detect-changes";

const prLookupUnavailableClients = new WeakSet<AdoClient>();
const prPolicyLookupUnavailableClients = new WeakSet<AdoClient>();
const prThreadsLookupUnavailableClients = new WeakSet<AdoClient>();
const prBuildLookupUnavailableClients = new WeakSet<AdoClient>();
const prReleaseLookupUnavailableClients = new WeakSet<AdoClient>();
const MASTER_BRANCH_NAME = "refs/heads/master";
const MERGED_PR_BUILD_FETCH_LIMIT = 200;
const RECENT_RELEASE_FETCH_LIMIT = 100;

function isPullRequestRelation(relation: AdoWorkItemRelation): boolean {
  const name = relation.attributes?.name;
  if (typeof name === "string" && /pull request/i.test(name)) {
    return true;
  }
  return /pullrequest/i.test(relation.url);
}

const RELATION_TITLE_KEYS = ["title", "Title"];
const RELATION_STATUS_KEYS = ["status", "Status", "state", "State"];
const RELATION_MERGE_STATUS_KEYS = ["mergeStatus", "MergeStatus"];

function getRelationAttribute(
  relation: AdoWorkItemRelation,
  keys: string[],
): string | undefined {
  const attrs = relation.attributes;
  if (!attrs) return undefined;
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

function getCompletionFlag(status: string | undefined): boolean | undefined {
  if (!status) return undefined;
  return status.toLowerCase() === "completed";
}

function mapPullRequestRelation(
  relation: AdoWorkItemRelation,
  org: string,
  project: string,
): RelatedPullRequest | null {
  if (!isPullRequestRelation(relation)) {
    return null;
  }

  const decodedUrl = decodeURIComponent(relation.url);
  const title = getRelationAttribute(relation, RELATION_TITLE_KEYS);
  const status = getRelationAttribute(relation, RELATION_STATUS_KEYS);
  const mergeStatus = getRelationAttribute(relation, RELATION_MERGE_STATUS_KEYS);
  const isCompleted = getCompletionFlag(status);

  if (/^https?:\/\//i.test(decodedUrl)) {
    const prId = decodedUrl.match(/pullrequest\/(\d+)/i)?.[1];
    const label = prId ? `PR #${prId}` : "Pull Request";
    return {
      id: prId ?? decodedUrl,
      label,
      ...(title ? { title } : {}),
      ...(status ? { status } : {}),
      ...(mergeStatus ? { mergeStatus } : {}),
      ...(isCompleted !== undefined ? { isCompleted } : {}),
      url: decodedUrl,
    };
  }

  const artifactMatch = decodedUrl.match(
    /vstfs:\/\/\/Git\/PullRequestId\/([^/]+)\/([^/]+)\/(\d+)/i,
  );
  if (!artifactMatch) {
    return null;
  }

  const [, , repoId, prId] = artifactMatch;
  return {
    id: prId,
    label: `PR #${prId}`,
    ...(title ? { title } : {}),
    ...(status ? { status } : {}),
    ...(mergeStatus ? { mergeStatus } : {}),
    ...(isCompleted !== undefined ? { isCompleted } : {}),
    url: `https://dev.azure.com/${org}/${project}/_git/${repoId}/pullrequest/${prId}`,
  };
}

function mapRelatedPullRequests(
  item: AdoWorkItem,
  org: string,
  project: string,
): RelatedPullRequest[] {
  const byUrl = new Map<string, RelatedPullRequest>();
  for (const relation of item.relations ?? []) {
    const pullRequest = mapPullRequestRelation(relation, org, project);
    if (!pullRequest || byUrl.has(pullRequest.url)) continue;
    byUrl.set(pullRequest.url, pullRequest);
  }
  return [...byUrl.values()];
}

const WORK_ITEM_DETAIL_FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.Tags",
  "System.AreaPath",
  "System.AssignedTo",
  "System.Rev",
];

function getWorkItemDetailFields(boardConfig?: CandidateBoardConfig): string[] {
  if (!boardConfig) return WORK_ITEM_DETAIL_FIELDS;
  return [...WORK_ITEM_DETAIL_FIELDS, boardConfig.columnFieldReferenceName];
}

function isRemovedState(state: string | undefined): boolean {
  return state?.trim().toLowerCase() === "removed";
}

function filterRemovedWorkItems(workItems: WorkItem[]): WorkItem[] {
  return workItems.filter((workItem) => !isRemovedState(workItem.state));
}

export function mapAdoWorkItem(
  item: AdoWorkItem,
  org: string,
  project: string,
  boardConfig?: CandidateBoardConfig,
): WorkItem {
  const f = item.fields;
  const relatedPullRequests = mapRelatedPullRequests(item, org, project);
  const rawBoardColumnName = boardConfig
    ? f[boardConfig.columnFieldReferenceName]
    : undefined;
  const boardColumnName =
    typeof rawBoardColumnName === "string" && rawBoardColumnName.trim()
      ? rawBoardColumnName.trim()
      : undefined;
  return {
    id: f["System.Id"],
    title: f["System.Title"],
    type: f["System.WorkItemType"],
    state: f["System.State"],
    ...(boardColumnName ? { boardColumnName } : {}),
    rev: f["System.Rev"],
    url:
      item._links?.html?.href ??
      `https://dev.azure.com/${org}/${project}/_workitems/edit/${item.id}`,
    ...(relatedPullRequests.length > 0 ? { relatedPullRequests } : {}),
  };
}

function createUiReviewWorkItemId(workItemId: number): number {
  return createSyntheticNegativeId(`ui-review:${workItemId}`);
}

function mapUiReviewWorkItem(
  item: AdoWorkItem,
  org: string,
  project: string,
  reviewTag: string,
): WorkItem | null {
  const mapped = mapAdoWorkItem(item, org, project);
  if (isRemovedState(mapped.state)) {
    return null;
  }

  const tags = parseAdoTags(item.fields["System.Tags"]);
  if (!hasAdoTag(tags, reviewTag)) {
    return null;
  }

  return {
    id: createUiReviewWorkItemId(mapped.id),
    displayId: mapped.id,
    title: mapped.title,
    type: CUSTOM_TASK_TYPE,
    state: mapped.state,
    rev: mapped.rev,
    url: mapped.url,
    kind: "ui-review",
    uiReview: {
      sourceWorkItemId: mapped.id,
      reviewTag,
    },
  };
}

interface PullRequestRef {
  repositoryId: string;
  pullRequestId: string;
}

function parsePullRequestRef(url: string): PullRequestRef | null {
  const decodedUrl = decodeURIComponent(url);
  const match = decodedUrl.match(/\/_git\/([^/?#]+)\/pullrequest\/(\d+)/i);
  if (!match) return null;
  return { repositoryId: match[1], pullRequestId: match[2] };
}

function getMergedBuildPullRequestId(build: AdoBuild): string | undefined {
  const candidateTexts = [
    build.buildNumber?.trim(),
    ...Object.values(build.triggerInfo ?? {})
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()),
  ].filter((value): value is string => Boolean(value));

  for (const text of candidateTexts) {
    const match = text.match(/\bMerged PR\s*#?\s*(\d+)(?::|\b)/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function getBuildPipelineKey(build: AdoBuild): string {
  const definitionId = build.definition?.id;
  const definitionName = build.definition?.name?.trim();
  if (typeof definitionId === "number" && definitionName) {
    return `${definitionId}:${definitionName}`;
  }
  if (typeof definitionId === "number") {
    return String(definitionId);
  }
  if (definitionName) {
    return definitionName;
  }
  return `build:${build.id}`;
}

function getBuildPipelineName(build: AdoBuild): string {
  const definitionName = build.definition?.name?.trim();
  if (definitionName) {
    return definitionName;
  }
  const definitionId = build.definition?.id;
  if (typeof definitionId === "number") {
    return `Pipeline ${definitionId}`;
  }
  return "Unknown pipeline";
}

function getBuildDisplayId(build: AdoBuild): string {
  const buildNumber = build.buildNumber?.trim();
  if (buildNumber) {
    const firstToken = buildNumber.split(/\s+/)[0];
    return firstToken.replace(/^#/, "");
  }
  return String(build.id);
}

const BUILD_RECENCY_FIELDS = [
  "queueTime",
  "startTime",
  "finishTime",
  "lastChangedDate",
] as const;

function parseBuildTimestamp(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function isBuildNewer(candidate: AdoBuild, current: AdoBuild): boolean {
  for (const field of BUILD_RECENCY_FIELDS) {
    const candidateTimestamp = parseBuildTimestamp(candidate[field]);
    const currentTimestamp = parseBuildTimestamp(current[field]);
    if (candidateTimestamp === undefined && currentTimestamp === undefined) {
      continue;
    }
    if (candidateTimestamp === undefined) {
      return false;
    }
    if (currentTimestamp === undefined) {
      return true;
    }
    if (candidateTimestamp !== currentTimestamp) {
      return candidateTimestamp > currentTimestamp;
    }
  }
  const candidateDisplayId = getBuildDisplayId(candidate);
  const currentDisplayId = getBuildDisplayId(current);
  const displayIdComparison = candidateDisplayId.localeCompare(currentDisplayId, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (displayIdComparison !== 0) {
    return displayIdComparison > 0;
  }
  return candidate.id > current.id;
}

function formatBuildStateLabel(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function getBuildDisplayStatus(build: AdoBuild): string {
  const normalizedStatus = build.status?.trim().toLowerCase();
  const rawResult = build.result?.trim();
  const normalizedResult = rawResult?.toLowerCase();
  if (
    normalizedStatus === "completed" &&
    rawResult &&
    normalizedResult !== "none"
  ) {
    return formatBuildStateLabel(rawResult);
  }
  if (build.status?.trim()) {
    return formatBuildStateLabel(build.status);
  }
  return "Unknown";
}

function isBuildCompleted(build: AdoBuild): boolean {
  return build.status?.trim().toLowerCase() === "completed";
}

function isBuildFailed(build: AdoBuild): boolean {
  const normalizedResult = build.result?.trim().toLowerCase();
  if (
    !normalizedResult ||
    normalizedResult === "succeeded" ||
    normalizedResult === "partiallysucceeded" ||
    normalizedResult === "none"
  ) {
    return false;
  }
  return true;
}

function isBuildSuccessful(build: AdoBuild): boolean {
  const normalizedStatus = build.status?.trim().toLowerCase();
  const normalizedResult = build.result?.trim().toLowerCase();
  return (
    normalizedStatus === "completed" &&
    (normalizedResult === "succeeded" || normalizedResult === "partiallysucceeded")
  );
}

interface MergedPullRequestBuildData {
  summaries: Map<string, PullRequestMergedBuildSummary>;
  successfulBuilds: Map<string, AdoBuild[]>;
}

async function getMergedPullRequestBuildData(
  client: AdoClient,
  pullRequestIds: Set<string>,
): Promise<MergedPullRequestBuildData> {
  if (pullRequestIds.size === 0 || prBuildLookupUnavailableClients.has(client)) {
    return {
      summaries: new Map(),
      successfulBuilds: new Map(),
    };
  }

  try {
    const builds = await client.listBuilds(MASTER_BRANCH_NAME, MERGED_PR_BUILD_FETCH_LIMIT);
    const latestBuildsByPullRequest = new Map<string, Map<string, AdoBuild>>();

    for (const build of builds) {
      const pullRequestId = getMergedBuildPullRequestId(build);
      if (!pullRequestId || !pullRequestIds.has(pullRequestId)) continue;
      const pipelineKey = getBuildPipelineKey(build);
      const buildsByPipeline = latestBuildsByPullRequest.get(pullRequestId) ?? new Map<string, AdoBuild>();
      if (!latestBuildsByPullRequest.has(pullRequestId)) {
        latestBuildsByPullRequest.set(pullRequestId, buildsByPipeline);
      }
      const currentBuild = buildsByPipeline.get(pipelineKey);
      if (!currentBuild || isBuildNewer(build, currentBuild)) {
        buildsByPipeline.set(pipelineKey, build);
      }
    }

    const summaries = new Map<string, PullRequestMergedBuildSummary>();
    const successfulBuilds = new Map<string, AdoBuild[]>();
    for (const [pullRequestId, buildsByPipeline] of latestBuildsByPullRequest) {
      const latestBuilds = [...buildsByPipeline.values()];
      const buildDetails = latestBuilds
        .map((build) => ({
          pipeline: getBuildPipelineName(build),
          buildId: getBuildDisplayId(build),
          status: getBuildDisplayStatus(build),
        }))
        .sort((left, right) => {
          const pipelineComparison = left.pipeline.localeCompare(right.pipeline);
          if (pipelineComparison !== 0) return pipelineComparison;
          return left.buildId.localeCompare(right.buildId);
        });
      summaries.set(pullRequestId, {
        totalCount: latestBuilds.length,
        completedCount: latestBuilds.filter(isBuildCompleted).length,
        failedCount: latestBuilds.filter(isBuildFailed).length,
        builds: buildDetails,
      });
      successfulBuilds.set(pullRequestId, latestBuilds.filter(isBuildSuccessful));
    }

    return { summaries, successfulBuilds };
  } catch {
    prBuildLookupUnavailableClients.add(client);
    return {
      summaries: new Map(),
      successfulBuilds: new Map(),
    };
  }
}

function getReleaseTrackingEnvironmentName(name?: string): "DEV" | "PROD" | undefined {
  const normalizedName = name?.trim().toLowerCase();
  if (normalizedName === "dev") return "DEV";
  if (normalizedName === "prod") return "PROD";
  return undefined;
}

function isReleaseEnvironmentDeployed(status?: string): boolean {
  const normalizedStatus = status?.trim().toLowerCase();
  return normalizedStatus === "succeeded" || normalizedStatus === "partiallysucceeded";
}

function isReleaseEnvironmentInProgress(status?: string): boolean {
  const normalizedStatus = status?.trim().toLowerCase();
  return (
    normalizedStatus === "inprogress" ||
    normalizedStatus === "queued" ||
    normalizedStatus === "scheduled" ||
    normalizedStatus === "pendingapproval" ||
    normalizedStatus === "notstarted" ||
    normalizedStatus === "queuedforagent" ||
    normalizedStatus === "pending"
  );
}

function getPreferredReleaseEnvironment(
  environments: Iterable<"DEV" | "PROD">,
): "DEV" | "PROD" | undefined {
  const values = new Set(environments);
  if (values.has("PROD")) return "PROD";
  if (values.has("DEV")) return "DEV";
  return undefined;
}

function getReleaseWebUrl(release: AdoRelease): string | undefined {
  return (
    release._links?.web?.href?.trim() ||
    release.webAccessUri?.trim() ||
    release.url?.trim() ||
    undefined
  );
}

function getMergedBuildReleaseStatus(
  deployedEnvironment: "DEV" | "PROD" | undefined,
  inProgressEnvironment: "DEV" | "PROD" | undefined,
): string {
  if (deployedEnvironment && inProgressEnvironment) {
    return `Deployed to ${deployedEnvironment}; ${inProgressEnvironment} in progress`;
  }
  if (deployedEnvironment) {
    return `Deployed to ${deployedEnvironment}`;
  }
  if (inProgressEnvironment) {
    return `${inProgressEnvironment} in progress`;
  }
  return "No release";
}

function getBuildReleaseMatchTokens(build: AdoBuild): Set<string> {
  const tokens = new Set<string>();
  const addToken = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    tokens.add(trimmed);
    if (trimmed.startsWith("#")) {
      tokens.add(trimmed.slice(1));
    }
  };

  addToken(String(build.id));
  addToken(getBuildDisplayId(build));
  addToken(build.buildNumber);
  return tokens;
}

function getReleaseArtifactMatchTokens(release: AdoRelease): Set<string> {
  const tokens = new Set<string>();
  const addToken = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    tokens.add(trimmed);
    if (trimmed.startsWith("#")) {
      tokens.add(trimmed.slice(1));
    }
  };

  for (const artifact of release.artifacts ?? []) {
    if (artifact.type?.trim().toLowerCase() !== "build") continue;
    for (const reference of Object.values(artifact.definitionReference ?? {})) {
      addToken(reference.id);
      addToken(reference.name);
    }
  }

  return tokens;
}

function isReleaseMatchedToBuild(release: AdoRelease, build: AdoBuild): boolean {
  const buildTokens = getBuildReleaseMatchTokens(build);
  if (buildTokens.size === 0) return false;
  const releaseTokens = getReleaseArtifactMatchTokens(release);
  for (const token of buildTokens) {
    if (releaseTokens.has(token)) {
      return true;
    }
  }
  return false;
}

interface PullRequestReleaseLookupResult {
  summaries: Map<string, PullRequestMergedReleaseSummary>;
  available: boolean;
}

async function getMergedPullRequestReleaseSummaries(
  client: AdoClient,
  successfulBuildsByPullRequest: Map<string, AdoBuild[]>,
): Promise<PullRequestReleaseLookupResult> {
  if (successfulBuildsByPullRequest.size === 0) {
    return { summaries: new Map(), available: true };
  }
  if (prReleaseLookupUnavailableClients.has(client)) {
    return { summaries: new Map(), available: false };
  }

  try {
    const recentReleases = await client.listRecentReleases(RECENT_RELEASE_FETCH_LIMIT);
    const releaseLists = await Promise.all(
      [...successfulBuildsByPullRequest.entries()].flatMap(([pullRequestId, builds]) =>
        builds.map(async (build) => [
          `${pullRequestId}/${build.id}`,
          await client.listReleasesForBuild(String(build.id), getBuildDisplayId(build)),
        ] as const),
      ),
    );
    const releasesByBuildKey = new Map<string, AdoRelease[]>(releaseLists);
    const summaries = new Map<string, PullRequestMergedReleaseSummary>();

    for (const [pullRequestId, builds] of successfulBuildsByPullRequest) {
      const releases = builds
        .map((build) => {
          const buildKey = `${pullRequestId}/${build.id}`;
          const matchingReleases = [
            ...(releasesByBuildKey.get(buildKey) ?? []),
            ...recentReleases.filter((release) => isReleaseMatchedToBuild(release, build)),
          ].filter(
            (release, index, allReleases) =>
              allReleases.findIndex((candidate) => candidate.id === release.id) === index,
          );
          const deployedEnvironments: Array<"DEV" | "PROD"> = [];
          const inProgressEnvironments: Array<"DEV" | "PROD"> = [];
          let releaseUrl: string | undefined;

          for (const release of matchingReleases) {
            const relevantEnvironments: Array<{
              environmentName: "DEV" | "PROD";
              status?: string;
            }> = [];
            for (const environment of release.environments ?? []) {
              const environmentName = getReleaseTrackingEnvironmentName(environment.name);
              if (!environmentName) continue;
              relevantEnvironments.push({
                environmentName,
                status: environment.status,
              });
            }
            if (relevantEnvironments.length === 0) continue;
            releaseUrl ??= getReleaseWebUrl(release);
            for (const environment of relevantEnvironments) {
              if (isReleaseEnvironmentDeployed(environment.status)) {
                deployedEnvironments.push(environment.environmentName);
                continue;
              }
              if (isReleaseEnvironmentInProgress(environment.status)) {
                inProgressEnvironments.push(environment.environmentName);
              }
            }
          }

          const deployedEnvironment = getPreferredReleaseEnvironment(deployedEnvironments);
          const inProgressEnvironment = getPreferredReleaseEnvironment(inProgressEnvironments);
          return {
            pipeline: getBuildPipelineName(build),
            buildId: getBuildDisplayId(build),
            status: getMergedBuildReleaseStatus(deployedEnvironment, inProgressEnvironment),
            ...(inProgressEnvironment ? { inProgressEnvironment } : {}),
            ...(deployedEnvironment ? { deployedEnvironment } : {}),
            ...(releaseUrl ? { url: releaseUrl } : {}),
          };
        })
        .sort((left, right) => {
          const pipelineComparison = left.pipeline.localeCompare(right.pipeline);
          if (pipelineComparison !== 0) return pipelineComparison;
          return left.buildId.localeCompare(right.buildId);
        });

      summaries.set(pullRequestId, {
        totalCount: builds.length,
        inProgressCount: releases.filter((release) => release.inProgressEnvironment !== undefined).length,
        deployedCount: releases.filter((release) => release.deployedEnvironment !== undefined).length,
        releases,
      });
    }

    return { summaries, available: true };
  } catch {
    prReleaseLookupUnavailableClients.add(client);
    return { summaries: new Map(), available: false };
  }
}

function hasPullRequestTitle(pr: RelatedPullRequest): boolean {
  return Boolean(pr.title?.trim());
}

function hasPullRequestStatus(pr: RelatedPullRequest): boolean {
  return Boolean(pr.status?.trim()) || pr.isCompleted !== undefined;
}

function hasPullRequestMergeStatus(pr: RelatedPullRequest): boolean {
  return Boolean(pr.mergeStatus?.trim());
}

function hasPullRequestReviewGate(pr: RelatedPullRequest): boolean {
  const mergeStatus = pr.mergeStatus?.trim().toLowerCase();
  if (mergeStatus !== "succeeded") return true;
  return pr.requiredReviewersApproved !== undefined;
}

function needsPullRequestBuildSummary(pr: RelatedPullRequest): boolean {
  return isPullRequestCompleted(pr.status, pr.isCompleted) && pr.mergedBuildSummary === undefined;
}

function needsPullRequestEnrichment(
  pr: RelatedPullRequest,
  options?: PullRequestEnrichmentOptions,
): boolean {
  const hasCoreDetails = hasPullRequestTitle(pr) && hasPullRequestStatus(pr);
  if (options?.includeBuildStatus === false) {
    return !hasCoreDetails;
  }
  return (
    needsPullRequestBuildSummary(pr) ||
    !(hasCoreDetails && hasPullRequestMergeStatus(pr) && hasPullRequestReviewGate(pr))
  );
}

interface PullRequestEnrichmentOptions {
  refreshActivePullRequests?: boolean;
  refreshCompletedPullRequests?: boolean;
  includeBuildStatus?: boolean;
}

function shouldRefreshPullRequest(
  pr: RelatedPullRequest,
  options?: PullRequestEnrichmentOptions,
): boolean {
  const needsEnrichment = needsPullRequestEnrichment(pr, options);
  const isCompleted = isPullRequestCompleted(pr.status, pr.isCompleted);
  if (isCompleted) {
    return options?.refreshCompletedPullRequests ? true : needsEnrichment;
  }
  if (options?.refreshActivePullRequests) {
    return true;
  }
  return needsEnrichment;
}

function isPullRequestCompleted(status?: string, isCompleted?: boolean): boolean {
  if (isCompleted !== undefined) return isCompleted;
  return status?.trim().toLowerCase() === "completed";
}

function getRequiredReviewerGate(pr: AdoPullRequest): {
  requiredReviewersApproved?: boolean;
  requiredReviewersPendingCount?: number;
} {
  if (!pr.reviewers) return {};
  const requiredReviewers = pr.reviewers.filter((reviewer) => reviewer.isRequired);
  if (requiredReviewers.length === 0) {
    return { requiredReviewersApproved: true, requiredReviewersPendingCount: 0 };
  }
  const pendingCount = requiredReviewers.filter(
    (reviewer) => typeof reviewer.vote !== "number" || reviewer.vote < 5,
  ).length;
  return {
    requiredReviewersApproved: pendingCount === 0,
    requiredReviewersPendingCount: pendingCount,
  };
}

function getPullRequestApprovalCount(pr: AdoPullRequest): number | undefined {
  if (!pr.reviewers) return undefined;
  return pr.reviewers.filter(
    (reviewer) =>
      reviewer.isContainer !== true &&
      typeof reviewer.vote === "number" &&
      reviewer.vote >= 5,
  ).length;
}

function getPullRequestReviewerCount(pr: AdoPullRequest): number | undefined {
  if (!pr.reviewers) return undefined;
  return pr.reviewers.filter((reviewer) => reviewer.isContainer !== true).length;
}

function matchesCurrentUserIdentity(
  identity: { id?: string; uniqueName?: string } | undefined,
  currentUser: AdoCurrentUser,
): boolean {
  if (!identity) return false;
  if (identity.id && currentUser.id && identity.id === currentUser.id) {
    return true;
  }
  return (
    typeof identity.uniqueName === "string" &&
    identity.uniqueName.localeCompare(currentUser.email, undefined, {
      sensitivity: "accent",
    }) === 0
  );
}

function getPullRequestReviewState(
  pr: AdoPullRequest,
  currentUser: AdoCurrentUser,
): "new" | "active" | "completed" {
  const reviewer = pr.reviewers?.find(
    (candidate) =>
      candidate.isContainer !== true && matchesCurrentUserIdentity(candidate, currentUser),
  );
  if (!reviewer) return "new";
  return reviewer.vote === 10 ? "completed" : "active";
}

function isFailingPolicyStatus(status?: string): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "rejected" || normalized === "broken";
}

function getPolicyCheckName(record: AdoPolicyEvaluationRecord): string {
  const displayName = record.configuration?.type?.displayName?.trim();
  if (displayName && displayName.length > 0) return displayName;
  return "Required policy";
}

function isIgnoredFailingPolicy(name: string): boolean {
  return name.trim().toLowerCase() === "require a merge strategy";
}

function getFailingStatusChecks(evaluations: AdoPolicyEvaluationRecord[]): string[] {
  const failures: string[] = [];
  for (const evaluation of evaluations) {
    if (evaluation.configuration?.isBlocking !== true) continue;
    if (evaluation.configuration?.isEnabled === false) continue;
    if (!isFailingPolicyStatus(evaluation.status)) continue;
    const policyName = getPolicyCheckName(evaluation);
    if (isIgnoredFailingPolicy(policyName)) continue;
    failures.push(policyName);
  }
  return [...new Set(failures)].sort((a, b) => a.localeCompare(b));
}

function getPullRequestPolicyArtifactId(pr: AdoPullRequest): string | undefined {
  const artifactId = pr.artifactId?.trim();
  if (artifactId && artifactId.length > 0) {
    const decoded = decodeURIComponent(artifactId);
    const codeReviewMatch = decoded.match(
      /^vstfs:\/\/\/CodeReview\/CodeReviewId\/([^/]+)\/(\d+)$/i,
    );
    if (codeReviewMatch) {
      return `vstfs:///CodeReview/CodeReviewId/${codeReviewMatch[1]}/${codeReviewMatch[2]}`;
    }
    const gitMatch = decoded.match(/^vstfs:\/\/\/Git\/PullRequestId\/([^/]+)\/[^/]+\/(\d+)$/i);
    if (gitMatch) {
      return `vstfs:///CodeReview/CodeReviewId/${gitMatch[1]}/${gitMatch[2]}`;
    }
  }

  const projectId = pr.repository?.project?.id?.trim();
  if (projectId && projectId.length > 0) {
    return `vstfs:///CodeReview/CodeReviewId/${projectId}/${pr.pullRequestId}`;
  }
  return undefined;
}

async function getPullRequestPoliciesSafe(
  client: AdoClient,
  artifactId: string,
): Promise<AdoPolicyEvaluationRecord[]> {
  if (prPolicyLookupUnavailableClients.has(client)) return [];
  try {
    return await client.getPullRequestPolicyEvaluations(artifactId);
  } catch {
    prPolicyLookupUnavailableClients.add(client);
    return [];
  }
}

function getUnresolvedCommentCount(threads: AdoPullRequestThread[]): number {
  let total = 0;
  for (const thread of threads) {
    if (thread.isDeleted === true) continue;
    if (thread.status?.trim().toLowerCase() !== "active") continue;
    total += 1;
  }
  return total;
}

async function getPullRequestUnresolvedCommentCountSafe(
  client: AdoClient,
  repositoryId: string,
  pullRequestId: string,
  status: string,
): Promise<number | undefined> {
  if (isPullRequestCompleted(status)) return undefined;
  if (prThreadsLookupUnavailableClients.has(client)) return undefined;
  try {
    const threads = await client.getPullRequestThreads(repositoryId, pullRequestId);
    return getUnresolvedCommentCount(threads);
  } catch {
    prThreadsLookupUnavailableClients.add(client);
    return undefined;
  }
}

interface PullRequestDetails {
  title: string;
  status: string;
  mergeStatus?: string;
  unresolvedCommentCount?: number;
  approvalCount?: number;
  requiredReviewersApproved?: boolean;
  requiredReviewersPendingCount?: number;
  failingStatusChecks?: string[];
  mergedBuildSummary?: PullRequestMergedBuildSummary | null;
  mergedReleaseSummary?: PullRequestMergedReleaseSummary | null;
}

function hasSameMergedBuildSummary(
  left: PullRequestMergedBuildSummary | null | undefined,
  right: PullRequestMergedBuildSummary | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  if (
    left.totalCount !== right.totalCount ||
    left.completedCount !== right.completedCount ||
    left.failedCount !== right.failedCount ||
    left.builds.length !== right.builds.length
  ) {
    return false;
  }
  return left.builds.every((build, index) => {
    const other = right.builds[index];
    return (
      other !== undefined &&
      build.pipeline === other.pipeline &&
      build.buildId === other.buildId &&
      build.status === other.status
    );
  });
}

function hasSameMergedReleaseSummary(
  left: PullRequestMergedReleaseSummary | null | undefined,
  right: PullRequestMergedReleaseSummary | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  if (
    left.totalCount !== right.totalCount ||
    left.inProgressCount !== right.inProgressCount ||
    left.deployedCount !== right.deployedCount ||
    left.releases.length !== right.releases.length
  ) {
    return false;
  }
  return left.releases.every((release, index) => {
    const other = right.releases[index];
    return (
      other !== undefined &&
      release.pipeline === other.pipeline &&
      release.buildId === other.buildId &&
      release.status === other.status &&
      release.inProgressEnvironment === other.inProgressEnvironment &&
      release.deployedEnvironment === other.deployedEnvironment &&
      release.url === other.url
    );
  });
}

async function loadPullRequestDetails(
  client: AdoClient,
  ref: PullRequestRef,
  pr: AdoPullRequest,
  options?: PullRequestEnrichmentOptions,
): Promise<PullRequestDetails> {
  const includeBuildStatus = options?.includeBuildStatus !== false;
  const policyArtifactId = includeBuildStatus ? getPullRequestPolicyArtifactId(pr) : undefined;
  const approvalCount = includeBuildStatus ? getPullRequestApprovalCount(pr) : undefined;
  const [failingStatusChecks, unresolvedCommentCount] = await Promise.all([
    policyArtifactId
      ? getPullRequestPoliciesSafe(client, policyArtifactId).then(getFailingStatusChecks)
      : Promise.resolve<string[]>([]),
    includeBuildStatus
      ? getPullRequestUnresolvedCommentCountSafe(
          client,
          ref.repositoryId,
          ref.pullRequestId,
          pr.status,
        )
      : Promise.resolve<number | undefined>(undefined),
  ]);

  return {
    title: pr.title,
    status: pr.status,
    ...(pr.mergeStatus ? { mergeStatus: pr.mergeStatus } : {}),
    ...(unresolvedCommentCount !== undefined ? { unresolvedCommentCount } : {}),
    ...(approvalCount !== undefined ? { approvalCount } : {}),
    ...(includeBuildStatus ? getRequiredReviewerGate(pr) : {}),
    ...(failingStatusChecks.length > 0 ? { failingStatusChecks } : {}),
  };
}

function mergePullRequestDetails(
  pr: RelatedPullRequest,
  details: PullRequestDetails,
): RelatedPullRequest {
  const title = details.title.trim();
  const status = details.status.trim();
  const mergeStatus = details.mergeStatus?.trim() ?? "";
  const unresolvedCommentCount = details.unresolvedCommentCount;
  const normalizedUnresolvedCommentCount =
    unresolvedCommentCount !== undefined && unresolvedCommentCount > 0
      ? unresolvedCommentCount
      : undefined;
  const approvalCount = details.approvalCount;
  const normalizedApprovalCount =
    approvalCount !== undefined && approvalCount > 0 ? approvalCount : undefined;
  const requiredReviewersApproved = details.requiredReviewersApproved;
  const requiredReviewersPendingCount = details.requiredReviewersPendingCount;
  const failingStatusChecks = details.failingStatusChecks;
  const mergedBuildSummary = details.mergedBuildSummary;
  const mergedReleaseSummary = details.mergedReleaseSummary;
  const isCompleted = status.toLowerCase() === "completed";

  const sameTitle = title.length === 0 || title === pr.title;
  const sameStatus = status.length === 0 || status === pr.status;
  const sameMergeStatus = mergeStatus.length === 0 || mergeStatus === pr.mergeStatus;
  const sameUnresolvedCommentCount =
    unresolvedCommentCount === undefined ||
    normalizedUnresolvedCommentCount === pr.unresolvedCommentCount;
  const sameApprovalCount =
    approvalCount === undefined || normalizedApprovalCount === pr.approvalCount;
  const sameRequiredReviewersApproved =
    requiredReviewersApproved === undefined ||
    requiredReviewersApproved === pr.requiredReviewersApproved;
  const sameRequiredReviewersPendingCount =
    requiredReviewersPendingCount === undefined ||
    requiredReviewersPendingCount === pr.requiredReviewersPendingCount;
  const sameFailingStatusChecks =
    failingStatusChecks === undefined ||
    (failingStatusChecks.length === 0 &&
      (!pr.failingStatusChecks || pr.failingStatusChecks.length === 0)) ||
    (failingStatusChecks.length > 0 &&
      pr.failingStatusChecks !== undefined &&
      failingStatusChecks.length === pr.failingStatusChecks.length &&
      failingStatusChecks.every((check, index) => check === pr.failingStatusChecks?.[index]));
  const sameMergedBuildSummary =
    mergedBuildSummary === undefined ||
    (mergedBuildSummary === null
      ? pr.mergedBuildSummary === null
      : hasSameMergedBuildSummary(mergedBuildSummary, pr.mergedBuildSummary));
  const sameMergedReleaseSummary =
    mergedReleaseSummary === undefined ||
    (mergedReleaseSummary === null
      ? pr.mergedReleaseSummary === null
      : hasSameMergedReleaseSummary(mergedReleaseSummary, pr.mergedReleaseSummary));
  const sameCompletion = status.length === 0 || isCompleted === pr.isCompleted;
  if (
    sameTitle &&
    sameStatus &&
    sameMergeStatus &&
    sameUnresolvedCommentCount &&
    sameApprovalCount &&
    sameRequiredReviewersApproved &&
    sameRequiredReviewersPendingCount &&
    sameFailingStatusChecks &&
    sameMergedBuildSummary &&
    sameMergedReleaseSummary &&
    sameCompletion
  ) {
    return pr;
  }

  const merged: RelatedPullRequest = {
    ...pr,
    ...(title.length > 0 ? { title } : {}),
    ...(status.length > 0 ? { status, isCompleted } : {}),
    ...(mergeStatus.length > 0 ? { mergeStatus } : {}),
    ...(unresolvedCommentCount !== undefined && normalizedUnresolvedCommentCount !== undefined
      ? { unresolvedCommentCount: normalizedUnresolvedCommentCount }
      : {}),
    ...(approvalCount !== undefined && normalizedApprovalCount !== undefined
      ? { approvalCount: normalizedApprovalCount }
      : {}),
    ...(requiredReviewersApproved !== undefined
      ? { requiredReviewersApproved }
      : {}),
    ...(requiredReviewersPendingCount !== undefined
      ? { requiredReviewersPendingCount }
      : {}),
    ...(failingStatusChecks !== undefined
      ? failingStatusChecks.length > 0
        ? { failingStatusChecks }
        : { failingStatusChecks: undefined }
      : {}),
    ...(mergedBuildSummary !== undefined ? { mergedBuildSummary } : {}),
    ...(mergedReleaseSummary !== undefined ? { mergedReleaseSummary } : {}),
  };
  if (unresolvedCommentCount !== undefined && normalizedUnresolvedCommentCount === undefined) {
    delete merged.unresolvedCommentCount;
  }
  if (approvalCount !== undefined && normalizedApprovalCount === undefined) {
    delete merged.approvalCount;
  }
  if (mergedBuildSummary === undefined) {
    delete merged.mergedBuildSummary;
  }
  if (mergedReleaseSummary === undefined) {
    delete merged.mergedReleaseSummary;
  }
  return merged;
}

async function enrichPullRequestDetails(
  client: AdoClient,
  workItems: WorkItem[],
  options?: PullRequestEnrichmentOptions,
): Promise<WorkItem[]> {
  if (prLookupUnavailableClients.has(client)) return workItems;

  const refsByKey = new Map<string, PullRequestRef>();
  for (const workItem of workItems) {
    for (const pr of workItem.relatedPullRequests ?? []) {
      if (!shouldRefreshPullRequest(pr, options)) continue;
      const ref = parsePullRequestRef(pr.url);
      if (!ref) continue;
      const key = `${ref.repositoryId}/${ref.pullRequestId}`;
      if (!refsByKey.has(key)) refsByKey.set(key, ref);
    }
  }

  if (refsByKey.size === 0) return workItems;

  const refs = [...refsByKey.entries()];
  const detailsByKey = new Map<string, PullRequestDetails>();

  const [firstKey, firstRef] = refs[0];
  try {
    const firstPr = await client.getPullRequest(firstRef.repositoryId, firstRef.pullRequestId);
    detailsByKey.set(firstKey, await loadPullRequestDetails(client, firstRef, firstPr, options));
  } catch {
    prLookupUnavailableClients.add(client);
    return workItems;
  }

  const remaining = refs.slice(1);
  if (remaining.length > 0) {
    const remainingResults = await Promise.allSettled(
      remaining.map(async ([key, ref]) => {
        const pr = await client.getPullRequest(ref.repositoryId, ref.pullRequestId);
        return [
          key,
          await loadPullRequestDetails(client, ref, pr, options),
        ] as const;
      }),
    );
    let hadLookupFailure = false;
    for (const result of remainingResults) {
      if (result.status === "rejected") {
        hadLookupFailure = true;
        continue;
      }
      detailsByKey.set(result.value[0], result.value[1]);
    }
    if (hadLookupFailure) {
      prLookupUnavailableClients.add(client);
    }
  }

  const completedPullRequestIds = new Set<string>();
  for (const [key, details] of detailsByKey) {
    if (!isPullRequestCompleted(details.status)) continue;
    const ref = refsByKey.get(key);
    if (!ref) continue;
    completedPullRequestIds.add(ref.pullRequestId);
  }

  if (options?.includeBuildStatus !== false && completedPullRequestIds.size > 0) {
    const { summaries: buildSummaries, successfulBuilds } = await getMergedPullRequestBuildData(
      client,
      completedPullRequestIds,
    );
    const releaseLookup = await getMergedPullRequestReleaseSummaries(client, successfulBuilds);
    for (const [key, details] of detailsByKey) {
      if (!isPullRequestCompleted(details.status)) continue;
      const ref = refsByKey.get(key);
      if (!ref) continue;
      detailsByKey.set(key, {
        ...details,
        mergedBuildSummary: buildSummaries.get(ref.pullRequestId) ?? null,
        ...(releaseLookup.available
          ? { mergedReleaseSummary: releaseLookup.summaries.get(ref.pullRequestId) ?? null }
          : {}),
      });
    }
  }

  return workItems.map((workItem) => {
    const pullRequests = workItem.relatedPullRequests;
    if (!pullRequests || pullRequests.length === 0) return workItem;

    let changed = false;
    const enrichedPullRequests = pullRequests.map((pr) => {
      if (!shouldRefreshPullRequest(pr, options)) return pr;
      const ref = parsePullRequestRef(pr.url);
      if (!ref) return pr;
      const detailKey = `${ref.repositoryId}/${ref.pullRequestId}`;
      const details = detailsByKey.get(detailKey);
      if (!details) return pr;
      const merged = mergePullRequestDetails(pr, details);
      if (merged !== pr) changed = true;
      return merged;
    });

    if (!changed) return workItem;
    return { ...workItem, relatedPullRequests: enrichedPullRequests };
  });
}

export interface FetchResult {
  workItems: WorkItem[];
  revMap: Map<number, { rev: number }>;
}

export interface FetchReviewWorkItemsResult {
  workItems: WorkItem[];
  newWorkIds: Set<number>;
  completedIds: Set<number>;
}

function createReviewWorkItemId(
  repositoryId: string,
  pullRequestId: number,
  workItemId: number,
): number {
  return createSyntheticNegativeId(`${repositoryId}:${pullRequestId}:${workItemId}`);
}

function parseConfiguredWorkItemTypes(
  workItemTypes?: string,
): Set<string> | null {
  const parsed = workItemTypes
    ?.split(",")
    .map((type) => type.trim())
    .filter(Boolean);
  if (!parsed || parsed.length === 0) return null;
  return new Set(parsed);
}

function isWorkItemWithinAreaPath(item: AdoWorkItem, areaPath?: string): boolean {
  if (!areaPath) return true;
  const rawAreaPath = item.fields["System.AreaPath"];
  if (typeof rawAreaPath !== "string") return false;
  const normalizedAreaPath = areaPath.trim().toLowerCase();
  const normalizedWorkItemAreaPath = rawAreaPath.trim().toLowerCase();
  return (
    normalizedWorkItemAreaPath === normalizedAreaPath ||
    normalizedWorkItemAreaPath.startsWith(`${normalizedAreaPath}\\`)
  );
}

function isAllowedReviewWorkItemType(
  item: AdoWorkItem,
  allowedTypes: Set<string> | null,
): boolean {
  if (!allowedTypes) return true;
  const rawType = item.fields["System.WorkItemType"];
  return typeof rawType === "string" && allowedTypes.has(rawType);
}

function getPullRequestRepositoryId(pr: AdoPullRequest): string {
  const repositoryId = pr.repository?.id?.trim() ?? pr.repository?.name?.trim();
  if (!repositoryId) {
    throw new Error(`Pull request ${pr.pullRequestId} is missing repository id`);
  }
  return repositoryId;
}

function buildPullRequestUrl(
  pr: AdoPullRequest,
  org: string,
  project: string,
  repositoryId: string,
): string {
  const url = pr.url?.trim();
  if (url && !url.includes("/_apis/")) return url;
  return `https://dev.azure.com/${org}/${project}/_git/${repositoryId}/pullrequest/${pr.pullRequestId}`;
}

async function buildRelatedPullRequestDetails(
  client: AdoClient,
  pr: AdoPullRequest,
  org: string,
  project: string,
  repositoryId: string,
  options?: { includeBuildStatus?: boolean },
): Promise<RelatedPullRequest> {
  const policyArtifactId =
    options?.includeBuildStatus === false ? undefined : getPullRequestPolicyArtifactId(pr);
  const approvalCount = getPullRequestApprovalCount(pr);
  const reviewerCount = getPullRequestReviewerCount(pr);
  const [failingStatusChecks, unresolvedCommentCount] = await Promise.all([
    policyArtifactId
      ? getPullRequestPoliciesSafe(client, policyArtifactId).then(getFailingStatusChecks)
      : Promise.resolve<string[]>([]),
    getPullRequestUnresolvedCommentCountSafe(
      client,
      repositoryId,
      String(pr.pullRequestId),
      pr.status,
    ),
  ]);

  return {
    id: String(pr.pullRequestId),
    label: `PR #${pr.pullRequestId}`,
    title: pr.title.trim(),
    status: pr.status.trim(),
    ...(pr.mergeStatus ? { mergeStatus: pr.mergeStatus.trim() } : {}),
    ...(unresolvedCommentCount !== undefined && unresolvedCommentCount > 0
      ? { unresolvedCommentCount }
      : {}),
    ...(approvalCount !== undefined && approvalCount > 0 ? { approvalCount } : {}),
    ...(reviewerCount !== undefined && reviewerCount > 0 ? { reviewerCount } : {}),
    ...getRequiredReviewerGate(pr),
    ...(failingStatusChecks.length > 0 ? { failingStatusChecks } : {}),
    ...(getCompletionFlag(pr.status) !== undefined
      ? { isCompleted: getCompletionFlag(pr.status) }
      : {}),
    url: buildPullRequestUrl(pr, org, project, repositoryId),
  };
}

export async function fetchReviewWorkItems(
  client: AdoClient,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
): Promise<FetchReviewWorkItemsResult> {
  const currentUser = await client.getCurrentUser();
  const activePullRequests = await client.listPullRequests("active");
  const reviewPullRequests = activePullRequests.filter(
    (pr) => !matchesCurrentUserIdentity(pr.createdBy, currentUser) && pr.isDraft !== true,
  );

  if (reviewPullRequests.length === 0) {
    return { workItems: [], newWorkIds: new Set(), completedIds: new Set() };
  }

  const workItemRefsByPullRequest = await Promise.all(
    reviewPullRequests.map(async (pr) => {
      const repositoryId = getPullRequestRepositoryId(pr);
      const workItemRefs = await client.listPullRequestWorkItems(
        repositoryId,
        String(pr.pullRequestId),
      );
      const reviewState = getPullRequestReviewState(pr, currentUser);
      return {
        pr,
        repositoryId,
        reviewState,
        workItemRefs,
      };
    }),
  );

  const linkedWorkItemIds = [
    ...new Set(
      workItemRefsByPullRequest.flatMap(({ workItemRefs }) =>
        workItemRefs
          .map((workItemRef) => Number(workItemRef.id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ),
  ];

  if (linkedWorkItemIds.length === 0) {
    return { workItems: [], newWorkIds: new Set(), completedIds: new Set() };
  }

  const allowedTypes = parseConfiguredWorkItemTypes(workItemTypes);
  const adoItems = await client.batchGetWorkItems(linkedWorkItemIds, getWorkItemDetailFields());
  const filteredAdoItems = adoItems.filter(
    (item) => isWorkItemWithinAreaPath(item, areaPath) && isAllowedReviewWorkItemType(item, allowedTypes),
  );
  const workItemsById = new Map(
    filterRemovedWorkItems(filteredAdoItems.map((item) => mapAdoWorkItem(item, org, project))).map(
      (workItem) => [workItem.id, workItem] as const,
    ),
  );

  const detailedReviewPullRequests = await Promise.all(
    workItemRefsByPullRequest.map(async ({ pr, repositoryId, reviewState }) => ({
      pr,
      repositoryId,
      relatedPullRequest: await buildRelatedPullRequestDetails(
        client,
        pr,
        org,
        project,
        repositoryId,
        { includeBuildStatus: reviewState === "active" },
      ),
    })),
  );
  const relatedPullRequestsByKey = new Map(
    detailedReviewPullRequests.map(({ pr, repositoryId, relatedPullRequest }) => [
      `${repositoryId}/${pr.pullRequestId}`,
      relatedPullRequest,
    ]),
  );

  const newWorkIds = new Set<number>();
  const completedIds = new Set<number>();
  const workItems: WorkItem[] = [];

  for (const { pr, repositoryId, reviewState, workItemRefs } of workItemRefsByPullRequest) {
    const relatedPullRequest = relatedPullRequestsByKey.get(
      `${repositoryId}/${pr.pullRequestId}`,
    );
    if (!relatedPullRequest) continue;

    const uniqueRefs = new Map<string, AdoResourceRef>();
    for (const workItemRef of workItemRefs) {
      uniqueRefs.set(workItemRef.id, workItemRef);
    }

    for (const workItemRef of uniqueRefs.values()) {
      const sourceWorkItem = workItemsById.get(Number(workItemRef.id));
      if (!sourceWorkItem) continue;

      const reviewWorkItemId = createReviewWorkItemId(
        repositoryId,
        pr.pullRequestId,
        sourceWorkItem.id,
      );
      workItems.push({
        ...sourceWorkItem,
        id: reviewWorkItemId,
        displayId: sourceWorkItem.id,
        kind: "review",
        relatedPullRequests: [relatedPullRequest],
        review: {
          provider: "ado",
          repositoryId,
          pullRequestId: pr.pullRequestId,
          reviewState,
        },
      });

      if (reviewState === "new") {
        newWorkIds.add(reviewWorkItemId);
      } else if (reviewState === "completed") {
        completedIds.add(reviewWorkItemId);
      }
    }
  }

  return { workItems, newWorkIds, completedIds };
}

export async function fetchWorkItemsInitial(
  client: AdoClient,
  _sourceState: string,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
  sourceBoardColumnOrBoardConfig?: string | CandidateBoardConfig,
  boardConfigOrBoardColumnNames?: CandidateBoardConfig | string[],
  boardColumnNamesArg: string[] = [],
): Promise<FetchResult> {
  const boardConfig = Array.isArray(boardConfigOrBoardColumnNames)
    ? (typeof sourceBoardColumnOrBoardConfig === "object"
        ? sourceBoardColumnOrBoardConfig
        : undefined)
    : boardConfigOrBoardColumnNames;
  const boardColumnNames = Array.isArray(boardConfigOrBoardColumnNames)
    ? boardConfigOrBoardColumnNames
    : boardColumnNamesArg.length > 0
      ? boardColumnNamesArg
      : typeof sourceBoardColumnOrBoardConfig === "string" && sourceBoardColumnOrBoardConfig
        ? [sourceBoardColumnOrBoardConfig]
        : [];

  const wiql =
    boardConfig && boardColumnNames.length > 0
      ? buildBoardColumnsWiqlQuery({
          boardConfig,
          columnNames: boardColumnNames,
          assignedTo: "@Me",
          areaPath,
          workItemTypes,
        })
      : buildWiqlQuery(_sourceState, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((w) => w.id);

  if (ids.length === 0) {
    return { workItems: [], revMap: new Map() };
  }

  const adoItems = await client.batchGetWorkItems(ids, getWorkItemDetailFields(boardConfig));
  const mappedItems = filterRemovedWorkItems(
    adoItems.map((i) => mapAdoWorkItem(i, org, project, boardConfig)),
  );
  const workItems = await enrichPullRequestDetails(client, mappedItems);
  const revMap = new Map(workItems.map((w) => [w.id, { rev: w.rev }]));

  return { workItems, revMap };
}

export async function fetchWorkItemsDelta(
  client: AdoClient,
  _sourceState: string,
  org: string,
  project: string,
  cachedRevMap: Map<number, { rev: number }>,
  cachedItems: WorkItem[],
  areaPath?: string,
  workItemTypes?: string,
  sourceBoardColumnOrBoardConfig?: string | CandidateBoardConfig,
  boardConfigOrBoardColumnNames?: CandidateBoardConfig | string[],
  boardColumnNamesArg: string[] = [],
): Promise<FetchResult> {
  const boardConfig = Array.isArray(boardConfigOrBoardColumnNames)
    ? (typeof sourceBoardColumnOrBoardConfig === "object"
        ? sourceBoardColumnOrBoardConfig
        : undefined)
    : boardConfigOrBoardColumnNames;
  const boardColumnNames = Array.isArray(boardConfigOrBoardColumnNames)
    ? boardConfigOrBoardColumnNames
    : boardColumnNamesArg.length > 0
      ? boardColumnNamesArg
      : typeof sourceBoardColumnOrBoardConfig === "string" && sourceBoardColumnOrBoardConfig
        ? [sourceBoardColumnOrBoardConfig]
        : [];

  const wiql =
    boardConfig && boardColumnNames.length > 0
      ? buildBoardColumnsWiqlQuery({
          boardConfig,
          columnNames: boardColumnNames,
          assignedTo: "@Me",
          areaPath,
          workItemTypes,
        })
      : buildWiqlQuery(_sourceState, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const freshIds = wiqlResult.workItems.map((w) => w.id);

  if (freshIds.length === 0) {
    return { workItems: [], revMap: new Map() };
  }

  // Get rev numbers for all current items
  const revItems = await client.batchGetWorkItems(freshIds, [
    "System.Id",
    "System.Rev",
  ]);
  const freshRevs = revItems.map((r) => ({
    id: r.id,
    rev: r.fields["System.Rev"],
  }));

  const changes = detectChanges(cachedRevMap, freshRevs);

  // Full-fetch only new + changed items
  const toFetch = [...changes.added, ...changes.changed];
  const fetchedIdSet = new Set(toFetch);
  let fetchedItems: WorkItem[] = [];
  if (toFetch.length > 0) {
    const adoItems = await client.batchGetWorkItems(
      toFetch,
      getWorkItemDetailFields(boardConfig),
    );
    const mappedItems = filterRemovedWorkItems(
      adoItems.map((i) => mapAdoWorkItem(i, org, project, boardConfig)),
    );
    fetchedItems = await enrichPullRequestDetails(client, mappedItems);
  }

  // Build final list: unchanged from cache, fetched for new/changed
  const fetchedMap = new Map(fetchedItems.map((w) => [w.id, w]));
  const cachedMap = new Map(cachedItems.map((w) => [w.id, w]));

  const workItems: WorkItem[] = freshIds
    .map((id) => (fetchedIdSet.has(id) ? fetchedMap.get(id) : cachedMap.get(id)))
    .filter((w): w is WorkItem => w !== undefined);

  const refreshedWorkItems = filterRemovedWorkItems(
    await enrichPullRequestDetails(client, workItems, {
      refreshActivePullRequests: true,
      refreshCompletedPullRequests: true,
    }),
  );

  const revMap = new Map(refreshedWorkItems.map((w) => [w.id, { rev: w.rev }]));

  return { workItems: refreshedWorkItems, revMap };
}

export async function fetchCompletedWorkItems(
  client: AdoClient,
  _approvalState: string,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
  approvalBoardColumn?: string,
  boardConfig?: CandidateBoardConfig,
): Promise<WorkItem[]> {
  const wiql =
    approvalBoardColumn && boardConfig
      ? buildBoardColumnWiqlQuery({
          boardConfig,
          columnName: approvalBoardColumn,
          assignedTo: "@Me",
          areaPath,
          workItemTypes,
        })
      : buildCompletedWiqlQuery(_approvalState, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((w) => w.id);

  if (ids.length === 0) return [];

  const adoItems = await client.batchGetWorkItems(ids, getWorkItemDetailFields(boardConfig));
  const mappedItems = filterRemovedWorkItems(
    adoItems.map((i) => mapAdoWorkItem(i, org, project, boardConfig)),
  );
  return enrichPullRequestDetails(client, mappedItems, {
    includeBuildStatus: false,
  });
}

export async function fetchUiReviewWorkItems(
  client: AdoClient,
  org: string,
  project: string,
  reviewTag: string,
  areaPath?: string,
  workItemTypes?: string,
): Promise<WorkItem[]> {
  const normalizedReviewTag = reviewTag.trim();
  if (!normalizedReviewTag) {
    return [];
  }

  const wiql = buildTagWiqlQuery(normalizedReviewTag, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((workItem) => workItem.id);

  if (ids.length === 0) {
    return [];
  }

  const adoItems = await client.batchGetWorkItems(ids, getWorkItemDetailFields());
  return adoItems
    .map((item) => mapUiReviewWorkItem(item, org, project, normalizedReviewTag))
    .filter((item): item is WorkItem => item !== null);
}

const CANDIDATE_CAP = 50;

export async function fetchCandidateWorkItems(
  client: AdoClient,
  _candidateState: string,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
  _candidateStatesByType?: string,
  boardConfig?: CandidateBoardConfig,
): Promise<WorkItem[]> {
  const wiql = boardConfig
    ? buildCandidateBoardWiqlQuery(boardConfig, areaPath, workItemTypes)
    : buildCandidateWiqlQuery(_candidateState, areaPath, workItemTypes, _candidateStatesByType);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.slice(0, CANDIDATE_CAP).map((w) => w.id);

  if (ids.length === 0) return [];

  const adoItems = await client.batchGetWorkItems(ids, getWorkItemDetailFields(boardConfig));
  const mappedItems = filterRemovedWorkItems(
    adoItems.map((i) => mapAdoWorkItem(i, org, project, boardConfig)),
  );
  return enrichPullRequestDetails(client, mappedItems);
}
