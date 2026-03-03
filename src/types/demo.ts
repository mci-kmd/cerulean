export interface DemoWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  url: string;
  description: string;
  acceptanceCriteria: string;
  reproSteps: string;
}

export interface DemoChecklistItem {
  id: string;
  workItemId: number;
  text: string;
  checked: boolean;
  order: number;
}

export interface DemoOrderItem {
  id: string;
  workItemId: number;
  position: number;
}
