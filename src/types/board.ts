export interface AdoSettings {
  id: string;
  pat: string;
  org: string;
  project: string;
  team: string;
  sourceState: string;
  approvalState: string;
  closedState: string;
  candidateState: string;
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
  approvalState: "",
  closedState: "",
  candidateState: "",
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

export interface WorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  rev: number;
  url: string;
  relatedPullRequests?: RelatedPullRequest[];
}

export interface RelatedPullRequest {
  id: string;
  label: string;
  title?: string;
  status?: string;
  isCompleted?: boolean;
  url: string;
}

export interface CustomTask {
  id: string;
  workItemId: number;
  title: string;
  completedAt?: number;
}

export { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "../constants/board-columns";
