import type {
  AdoCurrentUser,
  AdoBoard,
  AdoBoardReference,
  AdoBatchResponse,
  AdoGitRef,
  AdoGitRepository,
  AdoPolicyEvaluationRecord,
  AdoPullRequest,
  AdoResourceRef,
  AdoPullRequestStatus,
  AdoPullRequestThread,
  AdoWorkItem,
  WiqlResponse,
} from "@/types/ado";
import {
  addAdoTags,
  parseAdoTags,
  removeAdoTags,
  stringifyAdoTags,
} from "@/lib/ado-tags";

export class WorkItemAlreadyAssignedError extends Error {
  constructor(
    public workItemId: number,
    public assignee: string,
  ) {
    super(
      `Work item ${workItemId} is already assigned to ${assignee}`,
    );
    this.name = "WorkItemAlreadyAssignedError";
  }
}

export interface AdoClient {
  queryWorkItems(wiql: string): Promise<WiqlResponse>;
  batchGetWorkItems(ids: number[], fields?: string[]): Promise<AdoWorkItem[]>;
  listBoards(team?: string): Promise<AdoBoardReference[]>;
  getBoard(boardId: string, team?: string): Promise<AdoBoard>;
  getCurrentUser(): Promise<AdoCurrentUser>;
  listRepositories(): Promise<AdoGitRepository[]>;
  listRefs(repositoryId: string, filter?: string): Promise<AdoGitRef[]>;
  listPullRequests(status?: string): Promise<AdoPullRequest[]>;
  getPullRequest(repositoryId: string, pullRequestId: string): Promise<AdoPullRequest>;
  listPullRequestWorkItems(repositoryId: string, pullRequestId: string): Promise<AdoResourceRef[]>;
  getPullRequestStatuses(repositoryId: string, pullRequestId: string): Promise<AdoPullRequestStatus[]>;
  getPullRequestThreads(repositoryId: string, pullRequestId: string): Promise<AdoPullRequestThread[]>;
  getPullRequestPolicyEvaluations(artifactId: string): Promise<AdoPolicyEvaluationRecord[]>;
  addCurrentUserAsPullRequestReviewer(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void>;
  approvePullRequestAsCurrentUser(repositoryId: string, pullRequestId: string): Promise<void>;
  clearPullRequestReviewVote(repositoryId: string, pullRequestId: string): Promise<void>;
  removeCurrentUserAsPullRequestReviewer(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void>;
  updateWorkItemState(
    id: number,
    state: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): Promise<AdoWorkItem>;
  updateWorkItemTags(
    id: number,
    addTags?: string[],
    removeTags?: string[],
  ): Promise<AdoWorkItem>;
  startWorkItem(
    id: number,
    targetState: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): Promise<AdoWorkItem>;
  returnWorkItemToCandidate(
    id: number,
    targetState: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
  ): Promise<AdoWorkItem>;
  testConnection(): Promise<boolean>;
}

export interface AdoClientConfig {
  pat: string;
  org: string;
  project: string;
}

export function normalizeAdoClientConfig(config: AdoClientConfig): AdoClientConfig {
  const parsedOrg = parseAdoUrl(config.org);
  const parsedProject = parseAdoUrl(config.project);

  const pat = config.pat.trim();
  const trimmedOrg = config.org.trim();
  const trimmedProject = config.project.trim();
  const orgFromOrgInput =
    parsedOrg?.org ??
    (trimmedOrg && !parsedOrg ? normalizeAdoPathPart(trimmedOrg) : undefined);
  const orgFromProjectInput = parsedProject?.org;
  const projectFromProjectInput =
    parsedProject?.project ??
    (trimmedProject && !parsedProject ? normalizeAdoPathPart(trimmedProject) : undefined);
  const projectFromOrgInput = parsedOrg?.project;
  const org = orgFromOrgInput ?? orgFromProjectInput ?? "";
  const project = projectFromProjectInput ?? projectFromOrgInput ?? "";

  return { ...config, pat, org, project };
}

const BATCH_SIZE = 200;
const JSON_ACCEPT_HEADER = "application/json";
const FEDAUTH_REDIRECT_HEADER = "X-TFS-FedAuthRedirect";
const FEDAUTH_REDIRECT_SUPPRESS = "Suppress";
const FORCE_MSA_PASSTHROUGH_HEADER = "X-VSS-ForceMsaPassThrough";
const FORCE_MSA_PASSTHROUGH_VALUE = "true";
const PR_REVIEW_WRITE_SCOPE_HINT =
  "Check that the PAT includes Azure DevOps Code (Read & write).";

const DETAIL_FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AssignedTo",
  "System.Rev",
];

interface ConnectionDataResponse {
  authenticatedUser?: {
    id?: string;
    providerDisplayName?: string;
    properties?: {
      Account?: {
        $value?: unknown;
      };
    };
  };
}

export const DEMO_DETAIL_FIELDS = [
  ...DETAIL_FIELDS,
  "System.Description",
  "Microsoft.VSTS.Common.AcceptanceCriteria",
  "Microsoft.VSTS.TCM.ReproSteps",
];

interface WorkItemBatchGetRequest {
  ids: number[];
  fields?: string[];
  $expand?: "Relations";
}

function normalizeAdoPathPart(value: string): string {
  return decodeAdoValue(value).trim().replace(/^\/+|\/+$/g, "");
}

function decodeAdoValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAdoUrl(
  value: string,
): { org?: string; project?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = trimmed.includes("://") ? [trimmed] : [`https://${trimmed}`];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      const pathParts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(normalizeAdoPathPart)
        .filter(Boolean);

      if (host === "dev.azure.com") {
        const [org, project] = pathParts;
        if (org || project) return { org, project };
      }

      if (host.endsWith(".visualstudio.com")) {
        const org = normalizeAdoPathPart(host.slice(0, -".visualstudio.com".length));
        const [project] = pathParts;
        if (org || project) return { org, project };
      }
    } catch {
      continue;
    }
  }

  return null;
}

class AdoBatchFetchError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdoBatchFetchError";
  }
}

export class HttpAdoClient implements AdoClient {
  private org: string;
  private project: string;
  private baseUrl: string;
  private authHeader: string;
  private cachedCurrentUser: AdoCurrentUser | null = null;

  constructor(config: AdoClientConfig) {
    const normalized = normalizeAdoClientConfig(config);
    this.org = normalized.org;
    this.project = normalized.project;
    this.baseUrl = `https://dev.azure.com/${encodeURIComponent(normalized.org)}/${encodeURIComponent(normalized.project)}`;
    this.authHeader = `Basic ${btoa(":" + normalized.pat)}`;
  }

  private workTeamBaseUrl(team?: string): string {
    const resolvedTeam = team?.trim() ?? "";
    if (!resolvedTeam) {
      return `${this.baseUrl}/_apis/work`;
    }

    if (resolvedTeam.localeCompare(this.project, undefined, { sensitivity: "accent" }) === 0) {
      return `${this.baseUrl}/_apis/work`;
    }

    return `${this.baseUrl}/${encodeURIComponent(resolvedTeam)}/_apis/work`;
  }

  private authHeaders(contentType?: string): HeadersInit {
    return {
      Accept: JSON_ACCEPT_HEADER,
      Authorization: this.authHeader,
      [FEDAUTH_REDIRECT_HEADER]: FEDAUTH_REDIRECT_SUPPRESS,
      [FORCE_MSA_PASSTHROUGH_HEADER]: FORCE_MSA_PASSTHROUGH_VALUE,
      ...(contentType ? { "Content-Type": contentType } : {}),
    };
  }

  private jsonHeaders(): HeadersInit {
    return this.authHeaders("application/json");
  }

  private patchHeaders(): HeadersInit {
    return this.authHeaders("application/json-patch+json");
  }

  private async readJson<T>(res: Response, operation: string): Promise<T> {
    const body = (await res.text()).trim();
    if (body.length === 0) {
      throw new Error(`${operation} returned an empty response`);
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      const contentType = res.headers.get("content-type") ?? "unknown";
      const preview = body.replace(/\s+/g, " ").slice(0, 120);
      const authHint = contentType.includes("text/html")
        ? " Azure DevOps likely returned a sign-in page; check PAT/org/project and auth redirect headers."
        : "";
      throw new Error(
        `${operation} returned non-JSON response (${contentType}): ${preview}${authHint}`,
      );
    }
  }

  private async fetchWorkItemsBatch(
    request: WorkItemBatchGetRequest,
  ): Promise<AdoBatchResponse> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/workitemsbatch?api-version=7.1`,
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify(request),
      },
    );
    if (!res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json() as { message?: unknown };
        if (typeof data.message === "string" && data.message.length > 0) {
          throw new AdoBatchFetchError(res.status, data.message);
        }
      } else {
        const text = await res.text();
        if (text.length > 0) {
          throw new AdoBatchFetchError(res.status, text);
        }
      }
      throw new AdoBatchFetchError(res.status, `Batch fetch failed: ${res.status}`);
    }
    return this.readJson<AdoBatchResponse>(res, "Work items batch fetch");
  }

  private mergeBatchWithRelations(
    items: AdoWorkItem[],
    relationItems: AdoWorkItem[],
  ): AdoWorkItem[] {
    const relationById = new Map(relationItems.map((item) => [item.id, item]));
    return items.map((item) => {
      const relationItem = relationById.get(item.id);
      if (!relationItem) return item;
      return {
        ...item,
        ...(relationItem.relations ? { relations: relationItem.relations } : {}),
        ...(relationItem._links ? { _links: relationItem._links } : {}),
      };
    });
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
    return this.readJson<WiqlResponse>(res, "WIQL query");
  }

  async batchGetWorkItems(
    ids: number[],
    fields: string[] = DETAIL_FIELDS,
  ): Promise<AdoWorkItem[]> {
    if (ids.length === 0) return [];

    const results: AdoWorkItem[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      if (fields.length === 0) {
        const relationData = await this.fetchWorkItemsBatch({
          ids: batch,
          $expand: "Relations",
        });
        results.push(...relationData.value);
        continue;
      }

      const [fieldData, relationData] = await Promise.all([
        this.fetchWorkItemsBatch({ ids: batch, fields }),
        this.fetchWorkItemsBatch({ ids: batch, $expand: "Relations" }),
      ]);
      results.push(...this.mergeBatchWithRelations(fieldData.value, relationData.value));
    }
    return results;
  }

  async listBoards(team?: string): Promise<AdoBoardReference[]> {
    const res = await fetch(
      `${this.workTeamBaseUrl(team)}/boards?api-version=7.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Boards fetch failed: ${res.status}`);
    const data = await this.readJson<{ value?: AdoBoardReference[] } | AdoBoardReference[]>(
      res,
      "Boards fetch",
    );
    return Array.isArray(data) ? data : (data.value ?? []);
  }

  async getBoard(boardId: string, team?: string): Promise<AdoBoard> {
    const res = await fetch(
      `${this.workTeamBaseUrl(team)}/boards/${encodeURIComponent(boardId)}?api-version=7.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
    return this.readJson<AdoBoard>(res, "Board fetch");
  }

  async getCurrentUser(): Promise<AdoCurrentUser> {
    if (this.cachedCurrentUser) return this.cachedCurrentUser;
    const res = await fetch(
      `https://dev.azure.com/${this.org}/_apis/connectiondata?api-version=7.1-preview`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) throw new Error(`Connection data fetch failed: ${res.status}`);
    const data = await this.readJson<ConnectionDataResponse>(res, "Connection data fetch");
    const email = data.authenticatedUser?.properties?.Account?.$value;
    if (typeof email !== "string" || email.length === 0) {
      throw new Error("Connection data missing authenticated user email");
    }
    this.cachedCurrentUser = {
      ...(data.authenticatedUser?.id ? { id: data.authenticatedUser.id } : {}),
      ...(data.authenticatedUser?.providerDisplayName
        ? { displayName: data.authenticatedUser.providerDisplayName }
        : {}),
      email,
    };
    return this.cachedCurrentUser;
  }

  async listRepositories(): Promise<AdoGitRepository[]> {
    const res = await fetch(`${this.baseUrl}/_apis/git/repositories?api-version=7.1`, {
      method: "GET",
      headers: this.jsonHeaders(),
    });
    if (!res.ok) throw new Error(`Repositories fetch failed: ${res.status}`);
    const data = await this.readJson<AdoGitRepository[] | { value?: AdoGitRepository[] }>(
      res,
      "Repositories fetch",
    );
    return Array.isArray(data) ? data : (data.value ?? []);
  }

  async listRefs(repositoryId: string, filter?: string): Promise<AdoGitRef[]> {
    const refs: AdoGitRef[] = [];
    let continuationToken: string | null = null;
    do {
      const params = new URLSearchParams({ "api-version": "7.1", $top: "1000" });
      if (filter?.trim()) {
        params.set("filter", filter.trim());
      }
      if (continuationToken) {
        params.set("continuationToken", continuationToken);
      }
      const res = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs?${params.toString()}`,
        {
          method: "GET",
          headers: this.jsonHeaders(),
        },
      );
      if (!res.ok) throw new Error(`Refs fetch failed: ${res.status}`);
      const data = await this.readJson<AdoGitRef[] | { value?: AdoGitRef[] }>(
        res,
        "Refs fetch",
      );
      refs.push(...(Array.isArray(data) ? data : (data.value ?? [])));
      continuationToken = res.headers.get("x-ms-continuationtoken");
    } while (continuationToken);
    return refs;
  }

  async listPullRequests(status = "active"): Promise<AdoPullRequest[]> {
    const pullRequests: AdoPullRequest[] = [];
    const pageSize = 200;
    for (let skip = 0; ; skip += pageSize) {
      const res = await fetch(
        `${this.baseUrl}/_apis/git/pullrequests?searchCriteria.status=${encodeURIComponent(status)}&$top=${pageSize}&$skip=${skip}&api-version=7.1`,
        {
          method: "GET",
          headers: this.jsonHeaders(),
        },
      );
      if (!res.ok) throw new Error(`Pull requests fetch failed: ${res.status}`);
      const data = await this.readJson<AdoPullRequest[] | { value?: AdoPullRequest[] }>(
        res,
        "Pull requests fetch",
      );
      const page = Array.isArray(data) ? data : (data.value ?? []);
      pullRequests.push(...page);
      if (page.length < pageSize) break;
    }
    return pullRequests;
  }

  async getPullRequest(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoPullRequest> {
    const res = await fetch(
      `${this.baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}?api-version=7.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Pull request fetch failed: ${res.status}`);
    return this.readJson<AdoPullRequest>(res, "Pull request fetch");
  }

  async listPullRequestWorkItems(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoResourceRef[]> {
    const res = await fetch(
      `${this.baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/workitems?api-version=7.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Pull request work items fetch failed: ${res.status}`);
    const data = await this.readJson<AdoResourceRef[] | { value?: AdoResourceRef[] }>(
      res,
      "Pull request work items fetch",
    );
    return Array.isArray(data) ? data : (data.value ?? []);
  }

  async getPullRequestStatuses(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoPullRequestStatus[]> {
    const res = await fetch(
      `${this.baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/statuses?api-version=7.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Pull request statuses fetch failed: ${res.status}`);
    const data = await this.readJson<{ value?: AdoPullRequestStatus[] }>(
      res,
      "Pull request statuses fetch",
    );
    return data.value ?? [];
  }

  async getPullRequestThreads(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoPullRequestThread[]> {
    const res = await fetch(
      `${this.baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Pull request threads fetch failed: ${res.status}`);
    const data = await this.readJson<{ value?: AdoPullRequestThread[] }>(
      res,
      "Pull request threads fetch",
    );
    return data.value ?? [];
  }

  async getPullRequestPolicyEvaluations(
    artifactId: string,
  ): Promise<AdoPolicyEvaluationRecord[]> {
    const res = await fetch(
      `${this.baseUrl}/_apis/policy/evaluations?artifactId=${encodeURIComponent(artifactId)}&api-version=7.1-preview.1`,
      {
        method: "GET",
        headers: this.jsonHeaders(),
      },
    );
    if (!res.ok) throw new Error(`Pull request policy evaluations fetch failed: ${res.status}`);
    const data = await this.readJson<
      AdoPolicyEvaluationRecord[] | { value?: AdoPolicyEvaluationRecord[] }
    >(res, "Pull request policy evaluations fetch");
    if (Array.isArray(data)) return data;
    return data.value ?? [];
  }

  private async getRequiredCurrentUserId(): Promise<string> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser.id) {
      throw new Error("Connection data missing authenticated user id");
    }
    return currentUser.id;
  }

  private async putPullRequestReviewerVote(
    repositoryId: string,
    pullRequestId: string,
    reviewerId: string,
    vote: number,
  ): Promise<void> {
    const res = await this.fetchPullRequestReviewerMutation(
      `${this.baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/reviewers/${reviewerId}?api-version=7.1`,
      {
        method: "PUT",
        headers: this.jsonHeaders(),
        body: JSON.stringify({ id: reviewerId, vote }),
      },
      "Pull request reviewer update",
    );
    await this.readJson(res, "Pull request reviewer update");
  }

  private async fetchPullRequestReviewerMutation(
    url: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (error) {
      const reason = error instanceof Error && error.message ? ` Original error: ${error.message}` : "";
      throw new Error(
        `${operation} request failed before Azure DevOps returned a response. The browser can block this when the PAT is missing Code (Read & write). ${PR_REVIEW_WRITE_SCOPE_HINT}${reason}`,
      );
    }

    if (!res.ok) {
      const scopeHint =
        res.status === 401 || res.status === 403 ? ` ${PR_REVIEW_WRITE_SCOPE_HINT}` : "";
      throw new Error(`${operation} failed: ${res.status}.${scopeHint}`);
    }

    return res;
  }

  async addCurrentUserAsPullRequestReviewer(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    const reviewerId = await this.getRequiredCurrentUserId();
    await this.putPullRequestReviewerVote(repositoryId, pullRequestId, reviewerId, 0);
  }

  async approvePullRequestAsCurrentUser(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    const reviewerId = await this.getRequiredCurrentUserId();
    await this.putPullRequestReviewerVote(repositoryId, pullRequestId, reviewerId, 10);
  }

  async clearPullRequestReviewVote(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    const reviewerId = await this.getRequiredCurrentUserId();
    await this.putPullRequestReviewerVote(repositoryId, pullRequestId, reviewerId, 0);
  }

  async removeCurrentUserAsPullRequestReviewer(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    const reviewerId = await this.getRequiredCurrentUserId();
    await this.fetchPullRequestReviewerMutation(
      `${this.baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/reviewers/${reviewerId}?api-version=7.1`,
      {
        method: "DELETE",
        headers: this.authHeaders(),
      },
      "Pull request reviewer delete",
    );
  }

  private buildBoardColumnPatch(
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): { op: "add" | "replace"; path: string; value: string | boolean }[] {
    const patch: { op: "add" | "replace"; path: string; value: string | boolean }[] = [];
    if (targetBoardColumnField && targetBoardColumnName) {
      patch.push({
        op: "add",
        path: `/fields/${targetBoardColumnField}`,
        value: targetBoardColumnName,
      });
    }
    if (targetBoardDoneField && targetBoardDoneValue !== undefined) {
      patch.push({
        op: "add",
        path: `/fields/${targetBoardDoneField}`,
        value: targetBoardDoneValue,
      });
    }
    return patch;
  }

  async updateWorkItemState(
    id: number,
    state: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): Promise<AdoWorkItem> {
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/workitems/${id}?api-version=7.1`,
      {
        method: "PATCH",
        headers: this.patchHeaders(),
        body: JSON.stringify([
          { op: "replace", path: "/fields/System.State", value: state },
          ...this.buildBoardColumnPatch(
            targetBoardColumnField,
            targetBoardColumnName,
            targetBoardDoneField,
            targetBoardDoneValue,
          ),
        ]),
      },
    );
    if (!res.ok) throw new Error(`Update work item state failed: ${res.status}`);
    return this.readJson<AdoWorkItem>(res, "Update work item state");
  }

  async updateWorkItemTags(
    id: number,
    addTags: string[] = [],
    removeTags: string[] = [],
  ): Promise<AdoWorkItem> {
    const [current] = await this.batchGetWorkItems([id], [
      "System.Id",
      "System.Tags",
    ]);
    if (!current) {
      throw new Error(`Work item ${id} not found`);
    }

    const nextTags = removeAdoTags(
      addAdoTags(parseAdoTags(current.fields["System.Tags"]), addTags),
      removeTags,
    );
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/workitems/${id}?api-version=7.1`,
      {
        method: "PATCH",
        headers: this.patchHeaders(),
        body: JSON.stringify([
          {
            op: "add",
            path: "/fields/System.Tags",
            value: stringifyAdoTags(nextTags),
          },
        ]),
      },
    );
    if (!res.ok) throw new Error(`Update work item tags failed: ${res.status}`);
    return this.readJson<AdoWorkItem>(res, "Update work item tags");
  }

  private async getMyEmail(): Promise<string> {
    return (await this.getCurrentUser()).email;
  }

  async startWorkItem(
    id: number,
    targetState: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): Promise<AdoWorkItem> {
    const email = await this.getMyEmail();

    const [current] = await this.batchGetWorkItems([id]);
    if (current) {
      const assignee = current.fields["System.AssignedTo"];
      if (assignee && assignee.uniqueName !== email) {
        throw new WorkItemAlreadyAssignedError(id, assignee.displayName);
      }
    }

    const res = await fetch(
      `${this.baseUrl}/_apis/wit/workitems/${id}?api-version=7.1`,
      {
        method: "PATCH",
        headers: this.patchHeaders(),
        body: JSON.stringify([
          { op: "replace", path: "/fields/System.State", value: targetState },
          { op: "replace", path: "/fields/System.AssignedTo", value: email },
          ...this.buildBoardColumnPatch(
            targetBoardColumnField,
            targetBoardColumnName,
            targetBoardDoneField,
            targetBoardDoneValue,
          ),
        ]),
      },
    );
    if (!res.ok) throw new Error(`Start work item failed: ${res.status}`);
    return this.readJson<AdoWorkItem>(res, "Start work item");
  }

  async returnWorkItemToCandidate(
    id: number,
    targetState: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
  ): Promise<AdoWorkItem> {
    const patch: { op: "add" | "replace"; path: string; value: string | boolean }[] = [
      { op: "add", path: "/fields/System.State", value: targetState },
      { op: "add", path: "/fields/System.AssignedTo", value: "" },
    ];
    patch.push(
      ...this.buildBoardColumnPatch(
        targetBoardColumnField,
        targetBoardColumnName,
        targetBoardDoneField,
        targetBoardDoneField ? false : undefined,
      ),
    );
    const res = await fetch(
      `${this.baseUrl}/_apis/wit/workitems/${id}?api-version=7.1`,
      {
        method: "PATCH",
        headers: this.patchHeaders(),
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) throw new Error(`Return work item failed: ${res.status}`);
    return this.readJson<AdoWorkItem>(res, "Return work item");
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
    if (!res.ok) return false;
    await this.readJson<WiqlResponse>(res, "Connection test");
    return true;
  }
}

export function createAdoClient(config: AdoClientConfig): AdoClient {
  return new HttpAdoClient(config);
}
