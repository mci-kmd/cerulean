import type { AdoClient } from "./ado-client";
import type { AdoWorkItem } from "@/types/ado";
import type { WorkItem } from "@/types/board";
import { buildWiqlQuery, buildCompletedWiqlQuery, buildCandidateWiqlQuery } from "./wiql";
import { detectChanges } from "@/logic/detect-changes";

export function mapAdoWorkItem(item: AdoWorkItem, org: string, project: string): WorkItem {
  const f = item.fields;
  return {
    id: f["System.Id"],
    title: f["System.Title"],
    type: f["System.WorkItemType"],
    state: f["System.State"],
    rev: f["System.Rev"],
    url:
      item._links?.html?.href ??
      `https://dev.azure.com/${org}/${project}/_workitems/edit/${item.id}`,
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
