import { useCallback } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { BoardColumn } from "./board-column";
import { useBoardCollections } from "@/db/provider";
import type { BoardData } from "@/hooks/use-board";

interface BoardProps {
  data: BoardData;
}

export function Board({ data }: BoardProps) {
  const { assignments: assignmentsCol } = useBoardCollections();
  const { columns, columnItems } = data;

  const handleDragEnd = useCallback(
    (event: { canceled: boolean; operation: { source: any; target: any } }) => {
      if (event.canceled) return;

      const { source, target } = event.operation;
      if (!source || !target) return;

      const sourceId = source.id as string;
      const targetGroup = (target.group ?? target.id) as string;
      const targetIndex = target.index as number | undefined;

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

      assignmentsCol.update(sourceId, (draft: any) => {
        draft.columnId = targetGroup;
        draft.position = newPosition;
      });
    },
    [data.assignments, columnItems, assignmentsCol],
  );

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-4 overflow-x-auto h-[calc(100vh-49px)] bg-background">
        {columns.map((col) => (
          <BoardColumn
            key={col.id}
            id={col.id}
            name={col.name}
            items={columnItems.get(col.id) ?? []}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
