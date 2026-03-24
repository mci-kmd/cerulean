export interface WiqlResponse {
  workItems: { id: number; url: string }[];
}

export interface AdoBoardReference {
  id: string;
  name: string;
  url: string;
}

export interface AdoBoardColumn {
  id: string;
  name: string;
  isSplit?: boolean;
  columnType?: "incoming" | "inProgress" | "outgoing";
  stateMappings?: Record<string, string>;
}

export interface AdoFieldReference {
  referenceName: string;
  url?: string;
}

export interface AdoBoardFields {
  columnField?: AdoFieldReference;
  doneField?: AdoFieldReference;
  rowField?: AdoFieldReference;
}

export interface AdoBoard {
  id: string;
  name: string;
  url: string;
  columns?: AdoBoardColumn[];
  fields?: AdoBoardFields;
}

export interface AdoWorkItemFields {
  "System.Id": number;
  "System.Title": string;
  "System.WorkItemType": string;
  "System.State": string;
  "System.Tags"?: string;
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

export interface AdoIdentityRef {
  id?: string;
  displayName?: string;
  uniqueName?: string;
  isContainer?: boolean;
  isRequired?: boolean;
  vote?: number;
}

export interface AdoCurrentUser {
  id?: string;
  email: string;
  displayName?: string;
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
  isDraft?: boolean;
  mergeStatus?: string;
  artifactId?: string;
  createdBy?: AdoIdentityRef;
  repository?: {
    id?: string;
    name?: string;
    project?: {
      id?: string;
      name?: string;
    };
  };
  reviewers?: AdoIdentityRef[];
  url?: string;
}

export interface AdoGitRepository {
  id: string;
  name: string;
  defaultBranch?: string;
  remoteUrl?: string;
  webUrl?: string;
}

export interface AdoGitRef {
  name: string;
  objectId?: string;
  url?: string;
}

export interface AdoGitItemContentMetadata {
  fileName?: string;
}

export interface AdoGitItem {
  objectId?: string;
  gitObjectType?: string;
  commitId?: string;
  path: string;
  isFolder?: boolean;
  url?: string;
  content?: string;
  contentMetadata?: AdoGitItemContentMetadata;
}

export interface AdoGitPushCommit {
  commitId?: string;
  comment?: string;
}

export interface AdoGitPushRefUpdate {
  repositoryId?: string;
  name?: string;
  oldObjectId?: string;
  newObjectId?: string;
}

export interface AdoGitPushRepository {
  id?: string;
  name?: string;
}

export interface AdoGitPush {
  pushId: number;
  date?: string;
  commits?: AdoGitPushCommit[];
  refUpdates?: AdoGitPushRefUpdate[];
  repository?: AdoGitPushRepository;
  url?: string;
}

export interface AdoBuildDefinition {
  id?: number;
  name?: string;
}

export interface AdoBuild {
  id: number;
  appendCommitMessageToRunName?: boolean;
  buildNumber?: string;
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  lastChangedDate?: string;
  status?: string;
  result?: string;
  sourceBranch?: string;
  definition?: AdoBuildDefinition;
  triggerInfo?: Record<string, unknown>;
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

export interface AdoResourceRef {
  id: string;
  url: string;
}
