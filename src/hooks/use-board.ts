import { useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useBoardCollections } from "@/db/use-board-collections";
import type { BoardColumn, ColumnAssignment, WorkItem, AdoSettings } from "@/types/board";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";

export function useSettings(): AdoSettings | null {
  const { settings } = useBoardCollections();
  const result = useLiveQuery(settings);
  return result.data[0] ?? null;
}

export function useColumns(): BoardColumn[] {
  const { columns } = useBoardCollections();
  const result = useLiveQuery(columns);
  const sorted = useMemo(
    () => [...result.data].sort((a, b) => a.order - b.order),
    [result.data],
  );
  return sorted;
}

export function useAssignments(): ColumnAssignment[] {
  const { assignments } = useBoardCollections();
  const result = useLiveQuery(assignments);
  return result.data;
}

export interface BoardData {
  columns: BoardColumn[];
  assignments: ColumnAssignment[];
  settings: AdoSettings | null;
  columnItems: Map<string, { assignment: ColumnAssignment; workItem: WorkItem | undefined }[]>;
}

export function useBoard(workItems: WorkItem[]): BoardData {
  const settings = useSettings();
  const userColumns = useColumns();
  const assignments = useAssignments();

  const columns = useMemo(() => {
    if (!settings?.approvalState) return userColumns;
    const completedCol: BoardColumn = {
      id: COMPLETED_COLUMN_ID,
      name: "Completed",
      order: Infinity,
    };
    return [...userColumns, completedCol];
  }, [userColumns, settings?.approvalState]);

  const workItemMap = useMemo(
    () => new Map(workItems.map((w) => [w.id, w])),
    [workItems],
  );

  const columnItems = useMemo(() => {
    const map = new Map<
      string,
      { assignment: ColumnAssignment; workItem: WorkItem | undefined }[]
    >();

    const knownColumnIds = new Set(columns.map((col) => col.id));
    knownColumnIds.add(NEW_WORK_COLUMN_ID);
    for (const assignment of assignments) {
      knownColumnIds.add(assignment.columnId);
    }

    for (const columnId of knownColumnIds) {
      const items = assignments
        .filter((a) => a.columnId === columnId)
        .sort((a, b) => a.position - b.position)
        .map((a) => ({
          assignment: a,
          workItem: workItemMap.get(a.workItemId),
        }));
      map.set(columnId, items);
    }

    return map;
  }, [columns, assignments, workItemMap]);

  return { columns, assignments, settings, columnItems };
}
