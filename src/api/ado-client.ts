import type { WiqlResponse, AdoBatchResponse, AdoWorkItem } from "@/types/ado";

export interface AdoClient {
  queryWorkItems(wiql: string): Promise<WiqlResponse>;
  batchGetWorkItems(ids: number[], fields?: string[]): Promise<AdoWorkItem[]>;
  updateWorkItemState(id: number, state: string): Promise<AdoWorkItem>;
  testConnection(): Promise<boolean>;
}

export interface AdoClientConfig {
  pat: string;
  org: string;
  project: string;
}

const BATCH_SIZE = 200;

const DETAIL_FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AssignedTo",
  "System.Rev",
];

export const DEMO_DETAIL_FIELDS = [
  ...DETAIL_FIELDS,
  "System.Description",
  "Microsoft.VSTS.Common.AcceptanceCriteria",
  "Microsoft.VSTS.TCM.ReproSteps",
];

export class HttpAdoClient implements AdoClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: AdoClientConfig) {
    this.baseUrl = `https://dev.azure.com/${config.org}/${config.project}`;
    this.authHeader = `Basic ${btoa(":" + config.pat)}`;
  }

  private jsonHeaders(): HeadersInit {
    return { "Content-Type": "application/json", Authorization: this.authHeader };
  }

  private patchHeaders(): HeadersInit {
    return { "Content-Type": "application/json-patch+json", Authorization: this.authHeader };
  }

  async queryWorkItems(wiql: string): Promise<WiqlResponse> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify({ query: wiql }),
      },
    );
    if (!res.ok) throw new Error(`WIQL query failed: ${res.status}`);
    return res.json();
  }

  async batchGetWorkItems(
    ids: number[],
    fields: string[] = DETAIL_FIELDS,
  ): Promise<AdoWorkItem[]> {
    if (ids.length === 0) return [];

    const results: AdoWorkItem[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const params = new URLSearchParams({
        ids: batch.join(","),
        fields: fields.join(","),
        "api-version": "7.1",
      });
      const res = await fetch(
        `${this.baseUrl}/_apis/wit/workitems?${params}`,
        { headers: this.jsonHeaders() },
      );
      if (!res.ok) throw new Error(`Batch fetch failed: ${res.status}`);
      const data: AdoBatchResponse = await res.json();
      results.push(...data.value);
    }
    return results;
  }

  async updateWorkItemState(id: number, state: string): Promise<AdoWorkItem> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/workitems/${id}?api-version=7.1`,
      {
        method: "PATCH",
        headers: this.patchHeaders(),
        body: JSON.stringify([
          { op: "replace", path: "/fields/System.State", value: state },
        ]),
      },
    );
    if (!res.ok) throw new Error(`Update work item state failed: ${res.status}`);
    return res.json();
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify({
          query: "SELECT [System.Id] FROM WorkItems WHERE [System.Id] = -1",
        }),
      },
    );
    return res.ok;
  }
}

export function createAdoClient(config: AdoClientConfig): AdoClient {
  return new HttpAdoClient(config);
}
