export interface AdoSettings {
  id: string;
  pat: string;
  org: string;
  project: string;
  team: string;
  sourceState: string;
  sourceBoardColumn: string;
  candidateBoardColumn: string;
  approvalState: string;
  approvalBoardColumn: string;
  closedState: string;
  candidateState: string;
  candidateStatesByType: string;
  areaPath: string;
  workItemTypes: string;
  pollInterval: number;
}

export const DEFAULT_SETTINGS: AdoSettings = {
  id: "settings",
  pat: "",
  org: "",
  project: "",
  team: "",
  sourceState: "Active",
  sourceBoardColumn: "",
  candidateBoardColumn: "",
  approvalState: "",
  approvalBoardColumn: "",
  closedState: "",
  candidateState: "",
  candidateStatesByType: "",
  areaPath: "",
  workItemTypes: "",
  pollInterval: 30,
};

export interface BoardColumn {
  id: string;
  name: string;
  order: number;
}

export interface ColumnAssignment {
  id: string;
  workItemId: number;
  columnId: string;
  position: number;
  statusMessage?: string;
}

export interface ReviewWorkItem {
  repositoryId: string;
  pullRequestId: number;
  reviewState: "new" | "active" | "completed";
}

export interface WorkItem {
  id: number;
  displayId?: number;
  title: string;
  type: string;
  state: string;
  boardColumnName?: string;
  rev: number;
  url: string;
  kind?: "ado" | "review";
  relatedPullRequests?: RelatedPullRequest[];
  review?: ReviewWorkItem;
}

export interface RelatedPullRequest {
  id: string;
  label: string;
  title?: string;
  status?: string;
  mergeStatus?: string;
  unresolvedCommentCount?: number;
  approvalCount?: number;
  reviewerCount?: number;
  failingStatusChecks?: string[];
  requiredReviewersApproved?: boolean;
  requiredReviewersPendingCount?: number;
  isCompleted?: boolean;
  url: string;
}

export interface CustomTask {
  id: string;
  workItemId: number;
  title: string;
  completedAt?: number;
}

export function isReviewWorkItem(
  workItem: WorkItem | undefined,
): workItem is WorkItem & { kind: "review"; review: ReviewWorkItem } {
  return workItem?.kind === "review" && workItem.review !== undefined;
}

export { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "../constants/board-columns";
