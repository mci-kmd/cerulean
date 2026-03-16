import type { AdoClient } from "./ado-client";
import type {
  AdoPolicyEvaluationRecord,
  AdoPullRequest,
  AdoPullRequestThread,
  AdoWorkItem,
  AdoWorkItemRelation,
} from "@/types/ado";
import type { RelatedPullRequest, WorkItem } from "@/types/board";
import { buildWiqlQuery, buildCompletedWiqlQuery, buildCandidateWiqlQuery } from "./wiql";
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

export function mapAdoWorkItem(item: AdoWorkItem, org: string, project: string): WorkItem {
  const f = item.fields;
  const relatedPullRequests = mapRelatedPullRequests(item, org, project);
  return {
    id: f["System.Id"],
    title: f["System.Title"],
    type: f["System.WorkItemType"],
    state: f["System.State"],
    rev: f["System.Rev"],
    url:
      item._links?.html?.href ??
      `https://dev.azure.com/${org}/${project}/_workitems/edit/${item.id}`,
    ...(relatedPullRequests.length > 0 ? { relatedPullRequests } : {}),
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

export async function fetchWorkItemsInitial(
  client: AdoClient,
  sourceState: string,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
): Promise<FetchResult> {
  const wiql = buildWiqlQuery(sourceState, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((w) => w.id);

  if (ids.length === 0) {
    return { workItems: [], revMap: new Map() };
  }

  const adoItems = await client.batchGetWorkItems(ids);
  const mappedItems = adoItems.map((i) => mapAdoWorkItem(i, org, project));
  const workItems = await enrichPullRequestDetails(client, mappedItems);
  const revMap = new Map(workItems.map((w) => [w.id, { rev: w.rev }]));

  return { workItems, revMap };
}

export async function fetchWorkItemsDelta(
  client: AdoClient,
  sourceState: string,
  org: string,
  project: string,
  cachedRevMap: Map<number, { rev: number }>,
  cachedItems: WorkItem[],
  areaPath?: string,
  workItemTypes?: string,
): Promise<FetchResult> {
  const wiql = buildWiqlQuery(sourceState, areaPath, workItemTypes);
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
  let fetchedItems: WorkItem[] = [];
  if (toFetch.length > 0) {
    const adoItems = await client.batchGetWorkItems(toFetch);
    const mappedItems = adoItems.map((i) => mapAdoWorkItem(i, org, project));
    fetchedItems = await enrichPullRequestDetails(client, mappedItems);
  }

  // Build final list: unchanged from cache, fetched for new/changed
  const fetchedMap = new Map(fetchedItems.map((w) => [w.id, w]));
  const cachedMap = new Map(cachedItems.map((w) => [w.id, w]));

  const workItems: WorkItem[] = freshIds
    .map((id) => fetchedMap.get(id) ?? cachedMap.get(id))
    .filter((w): w is WorkItem => w !== undefined);

  const refreshedWorkItems = await enrichPullRequestDetails(client, workItems, {
    refreshActivePullRequests: true,
  });

  const revMap = new Map(refreshedWorkItems.map((w) => [w.id, { rev: w.rev }]));

  return { workItems: refreshedWorkItems, revMap };
}

export async function fetchCompletedWorkItems(
  client: AdoClient,
  approvalState: string,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
): Promise<WorkItem[]> {
  const wiql = buildCompletedWiqlQuery(approvalState, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((w) => w.id);

  if (ids.length === 0) return [];

  const adoItems = await client.batchGetWorkItems(ids);
  const mappedItems = adoItems.map((i) => mapAdoWorkItem(i, org, project));
  return enrichPullRequestDetails(client, mappedItems);
}

const CANDIDATE_CAP = 50;

export async function fetchCandidateWorkItems(
  client: AdoClient,
  candidateState: string,
  org: string,
  project: string,
  areaPath?: string,
  workItemTypes?: string,
): Promise<WorkItem[]> {
  const wiql = buildCandidateWiqlQuery(candidateState, areaPath, workItemTypes);
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.slice(0, CANDIDATE_CAP).map((w) => w.id);

  if (ids.length === 0) return [];

  const adoItems = await client.batchGetWorkItems(ids);
  const mappedItems = adoItems.map((i) => mapAdoWorkItem(i, org, project));
  return enrichPullRequestDetails(client, mappedItems);
}
