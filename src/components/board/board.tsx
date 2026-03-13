import { type ComponentProps, useCallback, useEffect } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation } from "@dnd-kit/react/sortable";
import { BoardColumn } from "./board-column";
import { NewWorkColumn } from "./new-work-column";
import { scheduleColumnChange } from "./schedule-column-change";
import { useBoardCollections } from "@/db/use-board-collections";
import { scheduleDndMutation, setDndRenderSettledResolver } from "@/lib/schedule-dnd-mutation";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import type { BoardData } from "@/hooks/use-board";

interface BoardProps {
  data: BoardData;
  bottomOffset?: number;
  isLoadingCandidates?: boolean;
  onAddTask?: () => void;
  onColumnChange?: (workItemId: number, fromColumnId: string, toColumnId: string) => void;
}

type DragEndEvent = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[0];
type DragEndManager = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[1];

type RenderTrackingManager = DragEndManager & {
  renderer?: { rendering?: Promise<unknown> };
};

export function Board({
  data,
  bottomOffset = 0,
  isLoadingCandidates = false,
  onAddTask,
  onColumnChange,
}: BoardProps) {
  const { assignments: assignmentsCol } = useBoardCollections();
  const { columns, columnItems } = data;

  const trackDndRendering = useCallback((_: unknown, manager?: DragEndManager) => {
    setDndRenderSettledResolver(
      () => (manager as RenderTrackingManager | undefined)?.renderer?.rendering,
    );
  }, []);

  useEffect(() => {
    return () => setDndRenderSettledResolver(undefined);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent, manager?: DragEndManager) => {
      trackDndRendering(event, manager);
      if (event.canceled) return;
      const operation = event.operation;
      const { source, target } = operation;
      if (!source || !target) return;

      const sourceId = source.id;
      if (typeof sourceId !== "string") return;

      const sortableOperation = isSortableOperation(operation);
      let targetIndex: number | undefined;
      const targetColumnId = (() => {
        if (sortableOperation) {
          const sortableTarget = operation.target;
          if (!sortableTarget) return undefined;

          targetIndex = sortableTarget.index;
          if (typeof sortableTarget.group === "string") {
            return sortableTarget.group;
          }

          if (typeof sortableTarget.id === "string") {
            return data.assignments.find((a) => a.id === sortableTarget.id)?.columnId;
          }
        }

        const fallbackTargetId = target.id;
        if (typeof fallbackTargetId !== "string") return undefined;
        if (
          fallbackTargetId === NEW_WORK_COLUMN_ID ||
          columnItems.has(fallbackTargetId)
        ) {
          return fallbackTargetId;
        }

        return data.assignments.find((a) => a.id === fallbackTargetId)?.columnId;
      })();
      if (!targetColumnId) return;

      const sourceAssignment =
        assignmentsCol.get(sourceId) ??
        data.assignments.find((a) => a.id === sourceId);
      if (!sourceAssignment) return;

      const targetItems = columnItems.get(targetColumnId) ?? [];
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

      const renderSettled = () =>
        (manager as RenderTrackingManager | undefined)?.renderer?.rendering;

      scheduleDndMutation(() => {
        const currentAssignment = assignmentsCol.get(sourceId);
        if (!currentAssignment) {
          return;
        }
        if (currentAssignment.columnId === targetColumnId) return;
        const fromColumnId = currentAssignment.columnId;
        const workItemId = currentAssignment.workItemId;

        assignmentsCol.update(sourceId, (draft) => {
          draft.columnId = targetColumnId;
          draft.position = newPosition;
        });

        if (onColumnChange) {
          scheduleColumnChange(
            onColumnChange,
            workItemId,
            fromColumnId,
            targetColumnId,
            renderSettled,
          );
        }
      }, renderSettled);
    },
    [data.assignments, columnItems, assignmentsCol, onColumnChange, trackDndRendering],
  );

  return (
    <DragDropProvider
      onDragStart={trackDndRendering}
      onDragMove={trackDndRendering}
      onDragOver={trackDndRendering}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-3 p-4 overflow-x-auto bg-background"
        style={{ height: `calc(100vh - 49px - ${bottomOffset}px)` }}
      >
        <NewWorkColumn
          boardItems={columnItems.get(NEW_WORK_COLUMN_ID) ?? []}
          isLoadingCandidates={isLoadingCandidates}
          onAddTask={onAddTask}
        />
        {columns.map((col) => (
          <BoardColumn
            key={col.id}
            id={col.id}
            name={col.name}
            items={columnItems.get(col.id) ?? []}
            variant={col.id === COMPLETED_COLUMN_ID ? "completed" : "default"}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
