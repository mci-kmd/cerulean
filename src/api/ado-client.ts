import type { WiqlResponse, AdoBatchResponse, AdoWorkItem } from "@/types/ado";

export interface AdoClient {
  queryWorkItems(wiql: string): Promise<WiqlResponse>;
  batchGetWorkItems(ids: number[], fields?: string[]): Promise<AdoWorkItem[]>;
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

export class HttpAdoClient implements AdoClient {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(config: AdoClientConfig) {
    this.baseUrl = `https://dev.azure.com/${config.org}/${config.project}`;
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(":" + config.pat)}`,
    };
  }

  async queryWorkItems(wiql: string): Promise<WiqlResponse> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        headers: this.headers,
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
        { headers: this.headers },
      );
      if (!res.ok) throw new Error(`Batch fetch failed: ${res.status}`);
      const data: AdoBatchResponse = await res.json();
      results.push(...data.value);
    }
    return results;
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        headers: this.headers,
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
