export interface AdoSettings {
  id: string;
  pat: string;
  org: string;
  project: string;
  team: string;
  githubUsername: string;
  githubRepository: string;
  retroRepository: string;
  retroBranch: string;
  retroFolder: string;
  retroFilenamePattern: string;
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
  uiReviewTag: string;
  pollInterval: number;
}

export const DEFAULT_SETTINGS: AdoSettings = {
  id: "settings",
  pat: "",
  org: "",
  project: "",
  team: "",
  githubUsername: "",
  githubRepository: "",
  retroRepository: "",
  retroBranch: "main",
  retroFolder: "",
  retroFilenamePattern: "{date}.md",
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
  uiReviewTag: "",
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
  mockupUrl?: string;
  discussionUrl?: string;
  candidateOptOut?: boolean;
}

export interface ReviewWorkItem {
  provider?: "ado" | "github";
  repositoryId: string;
  pullRequestId: number;
  reviewState: "new" | "active" | "completed";
}

export interface PullRequestMergedBuildSummary {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  builds: PullRequestMergedBuildDetail[];
}

export interface PullRequestMergedBuildDetail {
  pipeline: string;
  buildId: string;
  status: string;
}

export interface PullRequestMergedReleaseSummary {
  totalCount: number;
  inProgressCount: number;
  deployedCount: number;
  releases: PullRequestMergedReleaseDetail[];
}

export interface PullRequestMergedReleaseDetail {
  pipeline: string;
  buildId: string;
  status: string;
  inProgressEnvironment?: string;
  deployedEnvironment?: string;
  url?: string;
}

export interface UiReviewWorkItem {
  sourceWorkItemId: number;
  reviewTag: string;
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
  kind?: "ado" | "review" | "ui-review";
  relatedPullRequests?: RelatedPullRequest[];
  review?: ReviewWorkItem;
  uiReview?: UiReviewWorkItem;
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
  mergedBuildSummary?: PullRequestMergedBuildSummary | null;
  mergedReleaseSummary?: PullRequestMergedReleaseSummary | null;
  url: string;
}

export interface CustomTask {
  id: string;
  workItemId: number;
  title: string;
  completedAt?: number;
}

export interface WorkItemChecklistItem {
  id: string;
  workItemId: number;
  text: string;
  checked: boolean;
  order: number;
}

export function isReviewWorkItem(
  workItem: WorkItem | undefined,
): workItem is WorkItem & { kind: "review"; review: ReviewWorkItem } {
  return workItem?.kind === "review" && workItem.review !== undefined;
}

export function isUiReviewWorkItem(
  workItem: WorkItem | undefined,
): workItem is WorkItem & { kind: "ui-review"; uiReview: UiReviewWorkItem } {
  return workItem?.kind === "ui-review" && workItem.uiReview !== undefined;
}

export { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "../constants/board-columns";
