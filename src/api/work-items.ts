import type { AdoClient } from "./ado-client";
import type { AdoWorkItem, AdoWorkItemRelation } from "@/types/ado";
import type { RelatedPullRequest, WorkItem } from "@/types/board";
import { buildWiqlQuery, buildCompletedWiqlQuery, buildCandidateWiqlQuery } from "./wiql";
import { detectChanges } from "@/logic/detect-changes";

function isPullRequestRelation(relation: AdoWorkItemRelation): boolean {
  const name = relation.attributes?.name;
  if (typeof name === "string" && /pull request/i.test(name)) {
    return true;
  }
  return /pullrequest/i.test(relation.url);
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

  if (/^https?:\/\//i.test(decodedUrl)) {
    const prId = decodedUrl.match(/pullrequest\/(\d+)/i)?.[1];
    return {
      id: prId ?? decodedUrl,
      label: prId ? `PR #${prId}` : "Pull Request",
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
  const workItems = adoItems.map((i) => mapAdoWorkItem(i, org, project));
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
    fetchedItems = adoItems.map((i) => mapAdoWorkItem(i, org, project));
  }

  // Build final list: unchanged from cache, fetched for new/changed
  const fetchedMap = new Map(fetchedItems.map((w) => [w.id, w]));
  const cachedMap = new Map(cachedItems.map((w) => [w.id, w]));

  const workItems: WorkItem[] = freshIds
    .map((id) => fetchedMap.get(id) ?? cachedMap.get(id))
    .filter((w): w is WorkItem => w !== undefined);

  const revMap = new Map(workItems.map((w) => [w.id, { rev: w.rev }]));

  return { workItems, revMap };
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
  return adoItems.map((i) => mapAdoWorkItem(i, org, project));
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
  return adoItems.map((i) => mapAdoWorkItem(i, org, project));
}
