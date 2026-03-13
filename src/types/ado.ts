export interface WiqlResponse {
  workItems: { id: number; url: string }[];
}

export interface AdoWorkItemFields {
  "System.Id": number;
  "System.Title": string;
  "System.WorkItemType": string;
  "System.State": string;
  "System.AssignedTo"?: {
    displayName: string;
    uniqueName: string;
  };
  "System.Rev": number;
  "System.Description"?: string;
  "Microsoft.VSTS.Common.AcceptanceCriteria"?: string;
  "Microsoft.VSTS.TCM.ReproSteps"?: string;
  [key: string]: unknown;
}

export interface AdoWorkItem {
  id: number;
  rev: number;
  fields: AdoWorkItemFields;
  url: string;
  relations?: AdoWorkItemRelation[];
  _links?: {
    html?: { href: string };
  };
}

export interface AdoWorkItemRelation {
  rel: string;
  url: string;
  attributes?: {
    name?: string;
    [key: string]: unknown;
  };
}

export interface AdoBatchResponse {
  count: number;
  value: AdoWorkItem[];
}
