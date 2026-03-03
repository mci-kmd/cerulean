export interface DemoWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  assignedTo?: string;
  url: string;
  description: string;
  acceptanceCriteria: string;
}

export interface DemoChecklistItem {
  id: string;
  workItemId: number;
  text: string;
  checked: boolean;
  order: number;
}
