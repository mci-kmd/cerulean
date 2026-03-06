import type { BoardColumn, ColumnAssignment, WorkItem } from "@/types/board";
import { COMPLETED_COLUMN_ID } from "@/types/board";
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
  approvalState?: string,
): ReconcileResult {
  const freshIds = new Set(freshWorkItems.map((w) => w.id));
  const assignedIds = new Set(currentAssignments.map((a) => a.workItemId));

  const firstColumn = columns.sort((a, b) => a.order - b.order)[0];
  if (!firstColumn) {
    return { added: [], removed: [], updated: freshWorkItems };
  }

  // Items in fresh but not assigned -> add to appropriate column
  const newItems = freshWorkItems.filter((w) => !assignedIds.has(w.id));

  const added: ColumnAssignment[] = [];

  // Split new items: completed (approvalState) vs active (first column)
  const completedItems = approvalState
    ? newItems.filter((w) => w.state === approvalState)
    : [];
  const activeItems = approvalState
    ? newItems.filter((w) => w.state !== approvalState)
    : newItems;

  // Add active items to first column
  const existingInFirstCol = currentAssignments
    .filter((a) => a.columnId === firstColumn.id)
    .reduce((max, a) => Math.max(max, a.position), 0);

  for (let i = 0; i < activeItems.length; i++) {
    added.push({
      id: nanoid(),
      workItemId: activeItems[i].id,
      columnId: firstColumn.id,
      position: existingInFirstCol + i + 1,
    });
  }

  // Add completed items to completed column
  if (completedItems.length > 0) {
    const existingInCompleted = currentAssignments
      .filter((a) => a.columnId === COMPLETED_COLUMN_ID)
      .reduce((max, a) => Math.max(max, a.position), 0);

    for (let i = 0; i < completedItems.length; i++) {
      added.push({
        id: nanoid(),
        workItemId: completedItems[i].id,
        columnId: COMPLETED_COLUMN_ID,
        position: existingInCompleted + i + 1,
      });
    }
  }

  // Items assigned but not in fresh -> remove
  const removed = currentAssignments
    .filter((a) => !freshIds.has(a.workItemId))
    .map((a) => a.id);

  return { added, removed, updated: freshWorkItems };
}
