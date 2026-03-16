import { type AdoClient, WorkItemAlreadyAssignedError } from "./ado-client";
import type {
  AdoPolicyEvaluationRecord,
  AdoPullRequest,
  AdoPullRequestStatus,
  AdoWorkItem,
  WiqlResponse,
} from "@/types/ado";

export class MockAdoClient implements AdoClient {
  public wiqlResult: WiqlResponse = { workItems: [] };
  public workItems: AdoWorkItem[] = [];
  public shouldFail = false;
  public shouldFailPullRequest = false;
  public shouldFailPullRequestStatuses = false;
  public shouldFailPullRequestPolicyEvaluations = false;
  public myEmail = "me@test.com";
  public pullRequests = new Map<string, AdoPullRequest>();
  public pullRequestStatuses = new Map<string, AdoPullRequestStatus[]>();
  public pullRequestPolicyEvaluations = new Map<string, AdoPolicyEvaluationRecord[]>();
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

  async getPullRequestPolicyEvaluations(
    artifactId: string,
  ): Promise<AdoPolicyEvaluationRecord[]> {
    this.callLog.push({ method: "getPullRequestPolicyEvaluations", args: [artifactId] });
    if (this.shouldFail || this.shouldFailPullRequestPolicyEvaluations) {
      throw new Error("Mock pull request policy evaluations error");
    }
    return this.pullRequestPolicyEvaluations.get(artifactId) ?? [];
  }

  async updateWorkItemState(
    id: number,
    state: string,
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({ method: "updateWorkItemState", args: [id, state] });
    if (this.shouldFail) throw new Error("Mock update error");
    const item = this.workItems.find((w) => w.id === id);
    if (!item) throw new Error(`Work item ${id} not found`);
    return { ...item, fields: { ...item.fields, "System.State": state } };
  }

  async startWorkItem(
    id: number,
    targetState: string,
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({ method: "startWorkItem", args: [id, targetState] });
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
      },
    };
  }

  async returnWorkItemToCandidate(
    id: number,
    targetState: string,
  ): Promise<import("@/types/ado").AdoWorkItem> {
    this.callLog.push({ method: "returnWorkItemToCandidate", args: [id, targetState] });
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
