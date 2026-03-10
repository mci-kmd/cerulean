import { type ComponentProps, useCallback } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation } from "@dnd-kit/react/sortable";
import { BoardColumn } from "./board-column";
import { scheduleColumnChange } from "./schedule-column-change";
import { useBoardCollections } from "@/db/use-board-collections";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import { COMPLETED_COLUMN_ID } from "@/types/board";
import type { BoardData } from "@/hooks/use-board";

interface BoardProps {
  data: BoardData;
  bottomOffset?: number;
  onAddTask?: (columnId: string) => void;
  onColumnChange?: (workItemId: number, fromColumnId: string, toColumnId: string) => void;
}

type DragEndEvent = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[0];

export function Board({ data, bottomOffset = 0, onAddTask, onColumnChange }: BoardProps) {
  const { assignments: assignmentsCol } = useBoardCollections();
  const { columns, columnItems } = data;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) return;
      const operation = event.operation;
      if (!isSortableOperation(operation)) return;
      const { source, target } = operation;
      if (!source || !target) return;

      const sourceId = source.id;
      if (typeof sourceId !== "string") return;

      const targetGroup = target.group ?? target.id;
      if (typeof targetGroup !== "string") return;

      const targetIndex = target.index;

      const sourceAssignment = data.assignments.find(
        (a) => a.id === sourceId,
      );
      if (!sourceAssignment) return;

      const targetItems = columnItems.get(targetGroup) ?? [];
      const targetAssignments = targetItems
        .map((t) => t.assignment)
        .filter((a) => a.id !== sourceId);

      let newPosition: number;
      if (targetIndex !== undefined && targetIndex < targetAssignments.length) {
        const atIndex = targetAssignments[targetIndex];
        const prevPos =
          targetIndex > 0
            ? targetAssignments[targetIndex - 1].position
            : atIndex.position - 1;
        newPosition = (prevPos + atIndex.position) / 2;
      } else {
        const lastPos =
          targetAssignments.length > 0
            ? targetAssignments[targetAssignments.length - 1].position
            : 0;
        newPosition = lastPos + 1;
      }

      const fromColumnId = sourceAssignment.columnId;

      scheduleDndMutation(() => {
        assignmentsCol.update(sourceId, (draft) => {
          draft.columnId = targetGroup;
          draft.position = newPosition;
        });

        if (fromColumnId !== targetGroup && onColumnChange) {
          scheduleColumnChange(
            onColumnChange,
            sourceAssignment.workItemId,
            fromColumnId,
            targetGroup,
          );
        }
      });
    },
    [data.assignments, columnItems, assignmentsCol, onColumnChange],
  );

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div
        className="flex gap-3 p-4 overflow-x-auto bg-background"
        style={{ height: `calc(100vh - 49px - ${bottomOffset}px)` }}
      >
        {columns.map((col) => (
          <BoardColumn
            key={col.id}
            id={col.id}
            name={col.name}
            items={columnItems.get(col.id) ?? []}
            onAddTask={onAddTask}
            variant={col.id === COMPLETED_COLUMN_ID ? "completed" : "default"}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
