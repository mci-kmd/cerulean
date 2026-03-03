import type { BoardColumn, ColumnAssignment, WorkItem } from "@/types/board";
import { nanoid } from "nanoid";

export interface ReconcileResult {
  added: ColumnAssignment[];
  removed: string[];
  updated: WorkItem[];
}

export function reconcile(
  currentAssignments: ColumnAssignment[],
  freshWorkItems: WorkItem[],
  columns: BoardColumn[],
): ReconcileResult {
  const freshIds = new Set(freshWorkItems.map((w) => w.id));
  const assignedIds = new Set(currentAssignments.map((a) => a.workItemId));

  const firstColumn = columns.sort((a, b) => a.order - b.order)[0];
  if (!firstColumn) {
    return { added: [], removed: [], updated: freshWorkItems };
  }

  // Items in fresh but not assigned -> add to first column
  const newIds = freshWorkItems
    .filter((w) => !assignedIds.has(w.id))
    .map((w) => w.id);

  const existingInFirstCol = currentAssignments
    .filter((a) => a.columnId === firstColumn.id)
    .reduce((max, a) => Math.max(max, a.position), 0);

  const added: ColumnAssignment[] = newIds.map((workItemId, i) => ({
    id: nanoid(),
    workItemId,
    columnId: firstColumn.id,
    position: existingInFirstCol + i + 1,
  }));

  // Items assigned but not in fresh -> remove
  const removed = currentAssignments
    .filter((a) => !freshIds.has(a.workItemId))
    .map((a) => a.id);

  return { added, removed, updated: freshWorkItems };
}
