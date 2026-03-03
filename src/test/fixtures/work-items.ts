import type { AdoWorkItem } from "@/types/ado";
import type { WorkItem } from "@/types/board";

let nextId = 1;

export function createAdoWorkItem(
  overrides: Partial<AdoWorkItem> & { id?: number } = {},
): AdoWorkItem {
  const id = overrides.id ?? nextId++;
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/test-org/test-project/_apis/wit/workItems/${id}`,
    fields: {
      "System.Id": id,
      "System.Title": `Work Item ${id}`,
      "System.WorkItemType": "User Story",
      "System.State": "Active",
      "System.AssignedTo": {
        displayName: "Test User",
        uniqueName: "test@example.com",
      },
      "System.Rev": 1,
      ...(overrides.fields ?? {}),
    },
    _links: { html: { href: `https://dev.azure.com/test-org/test-project/_workitems/edit/${id}` } },
    ...overrides,
  };
}

export function createWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Work Item ${id}`,
    type: "User Story",
    state: "Active",
    assignedTo: "Test User",
    rev: 1,
    url: `https://dev.azure.com/test-org/test-project/_workitems/edit/${id}`,
    ...overrides,
  };
}

export function resetIdCounter() {
  nextId = 1;
}
