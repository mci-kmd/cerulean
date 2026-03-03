import type { BoardColumn, ColumnAssignment } from "@/types/board";

export function createColumn(overrides: Partial<BoardColumn> = {}): BoardColumn {
  return {
    id: "col-1",
    name: "To Do",
    order: 0,
    ...overrides,
  };
}

export function createDefaultColumns(): BoardColumn[] {
  return [
    { id: "col-todo", name: "To Do", order: 0 },
    { id: "col-doing", name: "In Progress", order: 1 },
    { id: "col-done", name: "Done", order: 2 },
  ];
}

export function createAssignment(
  overrides: Partial<ColumnAssignment> = {},
): ColumnAssignment {
  return {
    id: "asgn-1",
    workItemId: 1,
    columnId: "col-todo",
    position: 0,
    ...overrides,
  };
}
