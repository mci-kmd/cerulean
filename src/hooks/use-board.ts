import { useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useBoardCollections } from "@/db/provider";
import type { BoardColumn, ColumnAssignment, WorkItem, AdoSettings } from "@/types/board";
import { COMPLETED_COLUMN_ID } from "@/types/board";

export function useSettings(): AdoSettings | null {
  const { settings } = useBoardCollections();
  const result = useLiveQuery(settings);
  const data = result.data as unknown as AdoSettings[] | undefined;
  return data?.[0] ?? null;
}

export function useColumns(): BoardColumn[] {
  const { columns } = useBoardCollections();
  const result = useLiveQuery(columns);
  const data = (result.data ?? []) as unknown as BoardColumn[];
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.order - b.order),
    [data],
  );
  return sorted;
}

export function useAssignments(): ColumnAssignment[] {
  const { assignments } = useBoardCollections();
  const result = useLiveQuery(assignments);
  return (result.data ?? []) as unknown as ColumnAssignment[];
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

    for (const col of columns) {
      const items = assignments
        .filter((a) => a.columnId === col.id)
        .sort((a, b) => a.position - b.position)
        .map((a) => ({
          assignment: a,
          workItem: workItemMap.get(a.workItemId),
        }));
      map.set(col.id, items);
    }

    return map;
  }, [columns, assignments, workItemMap]);

  return { columns, assignments, settings, columnItems };
}
