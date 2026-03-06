import { useEffect } from "react";
import type { BoardColumn, ColumnAssignment, WorkItem } from "@/types/board";
import { reconcile } from "@/logic/reconcile";
import type { BoardCollections } from "@/db/create-collections";

export function useReconcile(
  workItems: WorkItem[],
  assignments: ColumnAssignment[],
  columns: BoardColumn[],
  collections: BoardCollections,
  isReady = true,
  approvalState?: string,
) {
  useEffect(() => {
    if (!isReady) return;
    if (workItems.length === 0 && assignments.length === 0) return;
    if (columns.length === 0) return;

    const { added, removed } = reconcile(assignments, workItems, columns, approvalState);

    if (added.length > 0) {
      for (const a of added) {
        collections.assignments.insert(a as any);
      }
    }

    if (removed.length > 0) {
      const existing = removed.filter((id) => collections.assignments.get(id));
      if (existing.length > 0) {
        collections.assignments.delete(existing);
      }
    }
  }, [workItems, assignments, columns, collections, isReady, approvalState]);
}
