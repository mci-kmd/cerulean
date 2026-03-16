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

export interface AdoPullRequest {
  pullRequestId: number;
  codeReviewId?: number;
  title: string;
  status: string;
  mergeStatus?: string;
  artifactId?: string;
  repository?: {
    project?: {
      id?: string;
    };
  };
  reviewers?: {
    isRequired?: boolean;
    vote?: number;
  }[];
}

export interface AdoPullRequestStatus {
  state?: string;
  description?: string;
  context?: {
    name?: string;
    genre?: string;
  };
}

export interface AdoPullRequestThreadComment {
  isDeleted?: boolean;
}

export interface AdoPullRequestThread {
  status?: string;
  isDeleted?: boolean;
  comments?: AdoPullRequestThreadComment[];
}

export interface AdoPolicyEvaluationRecord {
  status?: string;
  configuration?: {
    isBlocking?: boolean;
    isEnabled?: boolean;
    type?: {
      displayName?: string;
    };
  };
}
