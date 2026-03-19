import type { BoardColumn, ColumnAssignment, WorkItem } from "@/types/board";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/types/board";
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
  _approvalState?: string,
  _candidateState?: string,
  _candidateStatesByType?: string,
  candidateIds?: Set<number>,
  completedIds?: Set<number>,
): ReconcileResult {
  const freshIds = new Set(freshWorkItems.map((w) => w.id));
  const assignedIds = new Set(currentAssignments.map((a) => a.workItemId));

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
  if (sortedColumns.length === 0) {
    return { added: [], removed: [], updated: freshWorkItems };
  }

  // Items in fresh but not assigned -> add to appropriate column
  const newItems = freshWorkItems.filter((w) => !assignedIds.has(w.id));

  const added: ColumnAssignment[] = [];

  // Split new items: candidate (new work), completed, active
  const candidateItems = candidateIds
    ? newItems.filter((workItem) => candidateIds.has(workItem.id))
    : [];
  const nonCandidateItems = newItems.filter(
    (workItem) => !candidateIds?.has(workItem.id),
  );
  const completedItems = completedIds
    ? nonCandidateItems.filter((workItem) => completedIds.has(workItem.id))
    : [];
  const activeItems = nonCandidateItems.filter(
    (workItem) => !completedIds?.has(workItem.id),
  );

  // Add candidate items to New Work
  if (candidateItems.length > 0) {
    const existingInNewWork = currentAssignments
      .filter((a) => a.columnId === NEW_WORK_COLUMN_ID)
      .reduce((max, a) => Math.max(max, a.position), 0);

    for (let i = 0; i < candidateItems.length; i++) {
      added.push({
        id: nanoid(),
        workItemId: candidateItems[i].id,
        columnId: NEW_WORK_COLUMN_ID,
        position: existingInNewWork + i + 1,
      });
    }
  }

  const existingMaxPositionByColumnId = new Map<string, number>();
  for (const assignment of currentAssignments) {
    existingMaxPositionByColumnId.set(
      assignment.columnId,
      Math.max(existingMaxPositionByColumnId.get(assignment.columnId) ?? 0, assignment.position),
    );
  }

  const firstColumnId = sortedColumns[0]?.id;
  for (const workItem of activeItems) {
    if (!firstColumnId) continue;
    const nextPosition = (existingMaxPositionByColumnId.get(firstColumnId) ?? 0) + 1;
    existingMaxPositionByColumnId.set(firstColumnId, nextPosition);
    added.push({
      id: nanoid(),
      workItemId: workItem.id,
      columnId: firstColumnId,
      position: nextPosition,
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
