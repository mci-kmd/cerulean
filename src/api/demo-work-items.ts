import type { AdoClient } from "./ado-client";
import { DEMO_DETAIL_FIELDS } from "./ado-client";
import type { DemoWorkItem } from "@/types/demo";
import type { AdoWorkItem } from "@/types/ado";
import type { CandidateBoardConfig } from "@/lib/ado-board";
import { buildBoardColumnWiqlQuery } from "./wiql";

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

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
    description: stringOrEmpty(f["System.Description"]),
    acceptanceCriteria: stringOrEmpty(f["Microsoft.VSTS.Common.AcceptanceCriteria"]),
    reproSteps: stringOrEmpty(f["Microsoft.VSTS.TCM.ReproSteps"]),
  };
}

export async function fetchDemoWorkItems(
  client: AdoClient,
  approvalBoardColumn: string,
  boardConfigOrOrg: CandidateBoardConfig | string | undefined,
  orgOrProject?: string,
  projectMaybe?: string,
): Promise<DemoWorkItem[]> {
  const boardConfig =
    typeof boardConfigOrOrg === "object" ? boardConfigOrOrg : undefined;
  const org = typeof boardConfigOrOrg === "string" ? boardConfigOrOrg : (orgOrProject ?? "");
  const project = typeof boardConfigOrOrg === "string" ? (orgOrProject ?? "") : (projectMaybe ?? "");
  const wiql = boardConfig
    ? buildBoardColumnWiqlQuery({
        boardConfig,
        columnName: approvalBoardColumn,
        assignedTo: "@Me",
      })
    : `SELECT [System.Id] FROM WorkItems WHERE [System.State] = '${approvalBoardColumn.replace(/'/g, "''")}' AND [System.AssignedTo] = @Me`;
  const wiqlResult = await client.queryWorkItems(wiql);
  const ids = wiqlResult.workItems.map((w) => w.id);

  if (ids.length === 0) return [];

  const adoItems = await client.batchGetWorkItems(ids, DEMO_DETAIL_FIELDS);
  return adoItems.map((i) => mapAdoDemoWorkItem(i, org, project));
}
