import { type AdoClient, WorkItemAlreadyAssignedError } from "./ado-client";
import type {
  AdoCurrentUser,
  AdoBoard,
  AdoBoardReference,
  AdoBuild,
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

export class MockAdoClient implements AdoClient {
  public wiqlResult: WiqlResponse = { workItems: [] };
  public workItems: AdoWorkItem[] = [];
  public shouldFail = false;
  public shouldFailPullRequest = false;
  public shouldFailPullRequestStatuses = false;
  public shouldFailPullRequestThreads = false;
  public shouldFailPullRequestPolicyEvaluations = false;
  public shouldFailBuilds = false;
  public myEmail = "me@test.com";
  public myUserId = "me-id";
  public myDisplayName = "Me";
  public builds: AdoBuild[] = [];
  public pullRequests = new Map<string, AdoPullRequest>();
  public pullRequestWorkItems = new Map<string, AdoResourceRef[]>();
  public pullRequestStatuses = new Map<string, AdoPullRequestStatus[]>();
  public pullRequestThreads = new Map<string, AdoPullRequestThread[]>();
  public pullRequestPolicyEvaluations = new Map<string, AdoPolicyEvaluationRecord[]>();
  public boards: AdoBoardReference[] = [];
  public boardDetails = new Map<string, AdoBoard>();
  public repositories: AdoGitRepository[] = [];
  public refs = new Map<string, AdoGitRef[]>();
  public callLog: { method: string; args: unknown[] }[] = [];

  async queryWorkItems(wiql: string): Promise<WiqlResponse> {
    this.callLog.push({ method: "queryWorkItems", args: [wiql] });
    if (this.shouldFail) throw new Error("Mock WIQL error");
    return this.wiqlResult;
  }

  async batchGetWorkItems(
    ids: number[],
    fields?: string[],
  ): Promise<AdoWorkItem[]> {
    this.callLog.push({ method: "batchGetWorkItems", args: [ids, fields] });
    if (this.shouldFail) throw new Error("Mock batch error");
    return this.workItems.filter((w) => ids.includes(w.id));
  }

  async listBoards(team?: string): Promise<AdoBoardReference[]> {
    this.callLog.push({ method: "listBoards", args: [team] });
    if (this.shouldFail) throw new Error("Mock boards error");
    return this.boards;
  }

  async getBoard(boardId: string, team?: string): Promise<AdoBoard> {
    this.callLog.push({ method: "getBoard", args: [boardId, team] });
    if (this.shouldFail) throw new Error("Mock board error");
    const board = this.boardDetails.get(boardId);
    if (!board) throw new Error(`Board ${boardId} not found`);
    return board;
  }

  async getCurrentUser(): Promise<AdoCurrentUser> {
    this.callLog.push({ method: "getCurrentUser", args: [] });
    if (this.shouldFail) throw new Error("Mock current user error");
    return {
      id: this.myUserId,
      email: this.myEmail,
      displayName: this.myDisplayName,
    };
  }

  async listRepositories(): Promise<AdoGitRepository[]> {
    this.callLog.push({ method: "listRepositories", args: [] });
    if (this.shouldFail) throw new Error("Mock repositories error");
    return this.repositories;
  }

  async listRefs(repositoryId: string, filter?: string): Promise<AdoGitRef[]> {
    this.callLog.push({ method: "listRefs", args: [repositoryId, filter] });
    if (this.shouldFail) throw new Error("Mock refs error");
    const normalizedFilter = filter?.trim()
      ? filter.startsWith("refs/")
        ? filter
        : `refs/${filter}`
      : undefined;
    return (this.refs.get(repositoryId) ?? []).filter(
      (ref) => !normalizedFilter || ref.name.startsWith(normalizedFilter),
    );
  }

  async listBuilds(branchName?: string, top = 200): Promise<AdoBuild[]> {
    this.callLog.push({ method: "listBuilds", args: [branchName, top] });
    if (this.shouldFail || this.shouldFailBuilds) {
      throw new Error("Mock builds error");
    }
    const filteredBuilds = branchName?.trim()
      ? this.builds.filter(
          (build) =>
            build.sourceBranch?.trim().toLowerCase() === branchName.trim().toLowerCase(),
        )
      : this.builds;
    return filteredBuilds.slice(0, top);
  }

  async listPullRequests(_status = "active"): Promise<AdoPullRequest[]> {
    this.callLog.push({ method: "listPullRequests", args: [_status] });
    if (this.shouldFail || this.shouldFailPullRequest) {
      throw new Error("Mock pull requests error");
    }
    const pullRequests = [...this.pullRequests.values()];
    if (_status === "all") return pullRequests;
    return pullRequests.filter(
      (pullRequest) =>
        pullRequest.status.trim().toLowerCase() === _status.trim().toLowerCase(),
    );
  }

  async getPullRequest(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoPullRequest> {
    this.callLog.push({ method: "getPullRequest", args: [repositoryId, pullRequestId] });
    if (this.shouldFail || this.shouldFailPullRequest) {
      throw new Error("Mock pull request error");
    }
    const key = `${repositoryId}/${pullRequestId}`;
    const found = this.pullRequests.get(key);
    if (found) return found;
    return {
      pullRequestId: Number(pullRequestId),
      title: `PR #${pullRequestId}`,
      status: "active",
    };
  }

  async listPullRequestWorkItems(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoResourceRef[]> {
    this.callLog.push({ method: "listPullRequestWorkItems", args: [repositoryId, pullRequestId] });
    if (this.shouldFail || this.shouldFailPullRequest) {
      throw new Error("Mock pull request work items error");
    }
    return this.pullRequestWorkItems.get(`${repositoryId}/${pullRequestId}`) ?? [];
  }

  async getPullRequestStatuses(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoPullRequestStatus[]> {
    this.callLog.push({ method: "getPullRequestStatuses", args: [repositoryId, pullRequestId] });
    if (this.shouldFail || this.shouldFailPullRequestStatuses) {
      throw new Error("Mock pull request statuses error");
    }
    const key = `${repositoryId}/${pullRequestId}`;
    return this.pullRequestStatuses.get(key) ?? [];
  }

  async getPullRequestThreads(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<AdoPullRequestThread[]> {
    this.callLog.push({ method: "getPullRequestThreads", args: [repositoryId, pullRequestId] });
    if (this.shouldFail || this.shouldFailPullRequestThreads) {
      throw new Error("Mock pull request threads error");
    }
    const key = `${repositoryId}/${pullRequestId}`;
    return this.pullRequestThreads.get(key) ?? [];
  }

  async getPullRequestPolicyEvaluations(
    artifactId: string,
  ): Promise<AdoPolicyEvaluationRecord[]> {
    this.callLog.push({ method: "getPullRequestPolicyEvaluations", args: [artifactId] });
    if (this.shouldFail || this.shouldFailPullRequestPolicyEvaluations) {
      throw new Error("Mock pull request policy evaluations error");
    }
    return this.pullRequestPolicyEvaluations.get(artifactId) ?? [];
  }

  async addCurrentUserAsPullRequestReviewer(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    this.callLog.push({
      method: "addCurrentUserAsPullRequestReviewer",
      args: [repositoryId, pullRequestId],
    });
    if (this.shouldFail) throw new Error("Mock add reviewer error");
  }

  async approvePullRequestAsCurrentUser(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    this.callLog.push({
      method: "approvePullRequestAsCurrentUser",
      args: [repositoryId, pullRequestId],
    });
    if (this.shouldFail) throw new Error("Mock approve reviewer error");
  }

  async clearPullRequestReviewVote(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    this.callLog.push({
      method: "clearPullRequestReviewVote",
      args: [repositoryId, pullRequestId],
    });
    if (this.shouldFail) throw new Error("Mock clear reviewer vote error");
  }

  async removeCurrentUserAsPullRequestReviewer(
    repositoryId: string,
    pullRequestId: string,
  ): Promise<void> {
    this.callLog.push({
      method: "removeCurrentUserAsPullRequestReviewer",
      args: [repositoryId, pullRequestId],
    });
    if (this.shouldFail) throw new Error("Mock remove reviewer error");
  }

  async updateWorkItemState(
    id: number,
    state: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({
      method: "updateWorkItemState",
      args: [
        id,
        state,
        targetBoardColumnField,
        targetBoardColumnName,
        targetBoardDoneField,
        targetBoardDoneValue,
      ],
    });
    if (this.shouldFail) throw new Error("Mock update error");
    const item = this.workItems.find((w) => w.id === id);
    if (!item) throw new Error(`Work item ${id} not found`);
    return {
      ...item,
      fields: {
        ...item.fields,
        "System.State": state,
        ...(targetBoardColumnField && targetBoardColumnName
          ? { [targetBoardColumnField]: targetBoardColumnName }
          : {}),
        ...(targetBoardDoneField && targetBoardDoneValue !== undefined
          ? { [targetBoardDoneField]: targetBoardDoneValue }
          : {}),
      },
    };
  }

  async updateWorkItemTags(
    id: number,
    addTags: string[] = [],
    removeTags: string[] = [],
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({
      method: "updateWorkItemTags",
      args: [id, addTags, removeTags],
    });
    if (this.shouldFail) throw new Error("Mock update tags error");
    const index = this.workItems.findIndex((workItem) => workItem.id === id);
    if (index < 0) throw new Error(`Work item ${id} not found`);

    const item = this.workItems[index];
    const nextTags = removeAdoTags(
      addAdoTags(parseAdoTags(item.fields["System.Tags"]), addTags),
      removeTags,
    );
    const nextItem = {
      ...item,
      fields: {
        ...item.fields,
        "System.Tags": stringifyAdoTags(nextTags),
      },
    };
    this.workItems[index] = nextItem;
    return nextItem;
  }

  async startWorkItem(
    id: number,
    targetState: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
    targetBoardDoneValue?: boolean,
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({
      method: "startWorkItem",
      args: [
        id,
        targetState,
        targetBoardColumnField,
        targetBoardColumnName,
        targetBoardDoneField,
        targetBoardDoneValue,
      ],
    });
    if (this.shouldFail) throw new Error("Mock start error");
    const item = this.workItems.find((w) => w.id === id);
    if (!item) throw new Error(`Work item ${id} not found`);
    const assignee = item.fields["System.AssignedTo"];
    if (assignee && assignee.uniqueName !== this.myEmail) {
      throw new WorkItemAlreadyAssignedError(id, assignee.displayName);
    }
    return {
      ...item,
      fields: {
        ...item.fields,
        "System.State": targetState,
        "System.AssignedTo": { displayName: "Me", uniqueName: "me@test.com" },
        ...(targetBoardColumnField && targetBoardColumnName
          ? { [targetBoardColumnField]: targetBoardColumnName }
          : {}),
        ...(targetBoardDoneField && targetBoardDoneValue !== undefined
          ? { [targetBoardDoneField]: targetBoardDoneValue }
          : {}),
      },
    };
  }

  async returnWorkItemToCandidate(
    id: number,
    targetState: string,
    targetBoardColumnField?: string,
    targetBoardColumnName?: string,
    targetBoardDoneField?: string,
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({
      method: "returnWorkItemToCandidate",
      args: [id, targetState, targetBoardColumnField, targetBoardColumnName, targetBoardDoneField],
    });
    if (this.shouldFail) throw new Error("Mock return error");
    const item = this.workItems.find((w) => w.id === id);
    if (!item) throw new Error(`Work item ${id} not found`);
    return {
      ...item,
      fields: {
        ...item.fields,
        "System.State": targetState,
        "System.AssignedTo": undefined,
      },
    };
  }

  async testConnection(): Promise<boolean> {
    this.callLog.push({ method: "testConnection", args: [] });
    return !this.shouldFail;
  }
}
