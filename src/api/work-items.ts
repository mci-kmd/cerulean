import type { AdoClient } from "./ado-client";
import type {
  AdoCurrentUser,
  AdoPolicyEvaluationRecord,
  AdoPullRequest,
  AdoResourceRef,
  AdoPullRequestThread,
  AdoWorkItem,
  AdoWorkItemRelation,
} from "@/types/ado";
import type { RelatedPullRequest, WorkItem } from "@/types/board";
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

function needsPullRequestEnrichment(pr: RelatedPullRequest): boolean {
  return !(
    hasPullRequestTitle(pr) &&
    hasPullRequestStatus(pr) &&
    hasPullRequestMergeStatus(pr) &&
    hasPullRequestReviewGate(pr)
  );
}

interface PullRequestEnrichmentOptions {
  refreshActivePullRequests?: boolean;
}

function shouldRefreshPullRequest(
  pr: RelatedPullRequest,
  options?: PullRequestEnrichmentOptions,
): boolean {
  if (!options?.refreshActivePullRequests) return needsPullRequestEnrichment(pr);
  if (isPullRequestCompleted(pr.status, pr.isCompleted)) return needsPullRequestEnrichment(pr);
  return true;
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
  };
  if (unresolvedCommentCount !== undefined && normalizedUnresolvedCommentCount === undefined) {
    delete merged.unresolvedCommentCount;
  }
  if (approvalCount !== undefined && normalizedApprovalCount === undefined) {
    delete merged.approvalCount;
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
    const firstPolicyArtifactId = getPullRequestPolicyArtifactId(firstPr);
    const firstApprovalCount = getPullRequestApprovalCount(firstPr);
    const [failingStatusChecks, unresolvedCommentCount] = await Promise.all([
      firstPolicyArtifactId
        ? getPullRequestPoliciesSafe(client, firstPolicyArtifactId).then(getFailingStatusChecks)
        : Promise.resolve<string[]>([]),
      getPullRequestUnresolvedCommentCountSafe(
        client,
        firstRef.repositoryId,
        firstRef.pullRequestId,
        firstPr.status,
      ),
    ]);
    detailsByKey.set(firstKey, {
      title: firstPr.title,
      status: firstPr.status,
      ...(firstPr.mergeStatus ? { mergeStatus: firstPr.mergeStatus } : {}),
      ...(unresolvedCommentCount !== undefined
        ? { unresolvedCommentCount }
        : {}),
      ...(firstApprovalCount !== undefined ? { approvalCount: firstApprovalCount } : {}),
      ...getRequiredReviewerGate(firstPr),
      failingStatusChecks,
    });
  } catch {
    prLookupUnavailableClients.add(client);
    return workItems;
  }

  const remaining = refs.slice(1);
  if (remaining.length > 0) {
    const remainingResults = await Promise.allSettled(
      remaining.map(async ([key, ref]) => {
        const pr = await client.getPullRequest(ref.repositoryId, ref.pullRequestId);
        const policyArtifactId = getPullRequestPolicyArtifactId(pr);
        const approvalCount = getPullRequestApprovalCount(pr);
        const [failingStatusChecks, unresolvedCommentCount] = await Promise.all([
          policyArtifactId
            ? getPullRequestPoliciesSafe(client, policyArtifactId).then(getFailingStatusChecks)
            : Promise.resolve<string[]>([]),
          getPullRequestUnresolvedCommentCountSafe(
            client,
            ref.repositoryId,
            ref.pullRequestId,
            pr.status,
          ),
        ]);
        return [
          key,
          {
            title: pr.title,
            status: pr.status,
            ...(pr.mergeStatus ? { mergeStatus: pr.mergeStatus } : {}),
            ...(unresolvedCommentCount !== undefined
              ? { unresolvedCommentCount }
              : {}),
            ...(approvalCount !== undefined ? { approvalCount } : {}),
            ...getRequiredReviewerGate(pr),
            failingStatusChecks,
          },
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
): Promise<RelatedPullRequest> {
  const policyArtifactId = getPullRequestPolicyArtifactId(pr);
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
      return {
        pr,
        repositoryId,
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
    workItemRefsByPullRequest.map(async ({ pr, repositoryId }) => ({
      pr,
      repositoryId,
      relatedPullRequest: await buildRelatedPullRequestDetails(
        client,
        pr,
        org,
        project,
        repositoryId,
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

  for (const { pr, repositoryId, workItemRefs } of workItemRefsByPullRequest) {
    const reviewState = getPullRequestReviewState(pr, currentUser);
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
  return enrichPullRequestDetails(client, mappedItems);
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
