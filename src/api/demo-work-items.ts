import type { AdoClient } from "./ado-client";
import { DEMO_DETAIL_FIELDS } from "./ado-client";
import type { DemoWorkItem } from "@/types/demo";
import type { AdoWorkItem } from "@/types/ado";

export function mapAdoDemoWorkItem(
  item: AdoWorkItem,
  org: string,
  project: string,
): DemoWorkItem {
  const f = item.fields;
  return {
    id: f["System.Id"],
    title: f["System.Title"],
    type: f["System.WorkItemType"],
    state: f["System.State"],
    url:
      item._links?.html?.href ??
      `https://dev.azure.com/${org}/${project}/_workitems/edit/${item.id}`,
    description: (f["System.Description"] as string) ?? "",
    acceptanceCriteria:
      (f["Microsoft.VSTS.Common.AcceptanceCriteria"] as string) ?? "",
    reproSteps: (f["Microsoft.VSTS.TCM.ReproSteps"] as string) ?? "",
  };
}

export async function fetchDemoWorkItems(
  client: AdoClient,
  approvalState: string,
  org: string,
  project: string,
): Promise<DemoWorkItem[]> {
  const escaped = approvalState.replace(/'/g, "''");
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${escaped}' AND [System.AssignedTo] = @Me`;
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((w) => w.id);

  if (ids.length === 0) return [];

  const adoItems = await client.batchGetWorkItems(ids, DEMO_DETAIL_FIELDS);
  return adoItems.map((i) => mapAdoDemoWorkItem(i, org, project));
}
