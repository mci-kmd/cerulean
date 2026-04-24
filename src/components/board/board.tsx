import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { isSortableOperation } from "@dnd-kit/react/sortable";
import { BoardColumn } from "./board-column";
import { NewWorkColumn } from "./new-work-column";
import { scheduleColumnChange } from "./schedule-column-change";
import { useBoardCollections } from "@/db/use-board-collections";
import {
  resolveDndManagerSettled,
  scheduleDndMutation,
  setDndRenderSettledResolver,
  type DndManagerLike,
} from "@/lib/schedule-dnd-mutation";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import type { BoardData } from "@/hooks/use-board";
import type { ColumnAssignment, WorkItem } from "@/types/board";

interface BoardProps {
  data: BoardData;
  bottomOffset?: number;
  isLoadingCandidates?: boolean;
  onAddTask?: () => void;
  onColumnChange?: (workItemId: number, fromColumnId: string, toColumnId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

type DragEndEvent = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[0];
type DragEndManager = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[1];
type ColumnItem = { assignment: ColumnAssignment; workItem: WorkItem | undefined };

type OptimisticMove = {
  sourceId: string;
  targetColumnId: string;
  targetIndex: number | undefined;
  position: number;
};

export function Board({
  data,
  bottomOffset = 0,
  isLoadingCandidates = false,
  onAddTask,
  onColumnChange,
  onDragStateChange,
}: BoardProps) {
  const { assignments: assignmentsCol } = useBoardCollections();
  const { columns, columnItems } = data;
  const [optimisticMove, setOptimisticMove] = useState<OptimisticMove | null>(null);

  useEffect(() => {
    if (!optimisticMove) return;
    const latestAssignment = data.assignments.find((a) => a.id === optimisticMove.sourceId);
    if (!latestAssignment) {
      setOptimisticMove(null);
      return;
    }
    if (
      latestAssignment.columnId === optimisticMove.targetColumnId &&
      latestAssignment.position === optimisticMove.position
    ) {
      setOptimisticMove(null);
    }
  }, [data.assignments, optimisticMove]);

  const renderColumnItems = useMemo(() => {
    const next = new Map<string, ColumnItem[]>();
    for (const [columnId, items] of columnItems.entries()) {
      next.set(columnId, [...items]);
    }

    if (!optimisticMove) {
      return next;
    }

    let movingItem: ColumnItem | undefined;
    for (const items of next.values()) {
      const sourceIndex = items.findIndex((item) => item.assignment.id === optimisticMove.sourceId);
      if (sourceIndex < 0) continue;
      [movingItem] = items.splice(sourceIndex, 1);
      break;
    }

    if (!movingItem) {
      return next;
    }

    const targetItems = next.get(optimisticMove.targetColumnId) ?? [];
    const insertAt =
      typeof optimisticMove.targetIndex === "number" &&
      Number.isFinite(optimisticMove.targetIndex) &&
      optimisticMove.targetIndex >= 0
        ? Math.min(optimisticMove.targetIndex, targetItems.length)
        : targetItems.length;
    targetItems.splice(insertAt, 0, {
      ...movingItem,
      assignment: {
        ...movingItem.assignment,
        columnId: optimisticMove.targetColumnId,
        position: optimisticMove.position,
      },
    });
    next.set(optimisticMove.targetColumnId, targetItems);
    return next;
  }, [columnItems, optimisticMove]);

  const assignmentItems = useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        type: string;
      }
    >();

    for (const items of renderColumnItems.values()) {
      for (const item of items) {
        if (!item.workItem) continue;
        map.set(item.assignment.id, {
          title: item.workItem.title,
          type: item.workItem.type,
        });
      }
    }

    return map;
  }, [renderColumnItems]);

  const trackDndRendering = useCallback((_: unknown, manager?: DragEndManager) => {
    setDndRenderSettledResolver(() =>
      resolveDndManagerSettled(manager as DndManagerLike | undefined),
    );
  }, []);

  useEffect(() => {
    return () => setDndRenderSettledResolver(undefined);
  }, []);

  const setDragInactiveWhenSettled = useCallback(
    (manager?: DragEndManager) => {
      if (!onDragStateChange) return;
      const settled = resolveDndManagerSettled(manager as DndManagerLike | undefined);
      if (!settled) {
        onDragStateChange(false);
        return;
      }
      settled.then(
        () => onDragStateChange(false),
        () => onDragStateChange(false),
      );
    },
    [onDragStateChange],
  );

  const handleDragStart = useCallback(
    (event: unknown, manager?: DragEndManager) => {
      trackDndRendering(event, manager);
      setOptimisticMove(null);
      onDragStateChange?.(true);
    },
    [onDragStateChange, trackDndRendering],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent, manager?: DragEndManager) => {
      trackDndRendering(event, manager);
      try {
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
            renderColumnItems.has(fallbackTargetId)
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

        const targetItems = renderColumnItems.get(targetColumnId) ?? [];
        const targetAssignments = targetItems
          .map((t) => t.assignment)
          .filter((a) => a.id !== sourceId);

        let newPosition: number;
        if (
          typeof targetIndex === "number" &&
          Number.isFinite(targetIndex) &&
          targetIndex >= 0 &&
          targetIndex < targetAssignments.length
        ) {
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

        if (
          sourceAssignment.columnId === targetColumnId &&
          sourceAssignment.position === newPosition
        ) {
          return;
        }
        setOptimisticMove({
          sourceId,
          targetColumnId,
          targetIndex,
          position: newPosition,
        });

        const renderSettled = () =>
          resolveDndManagerSettled(manager as DndManagerLike | undefined);

        scheduleDndMutation(() => {
          const currentAssignment = assignmentsCol.get(sourceId);
          if (!currentAssignment) {
            setOptimisticMove((prev) => (prev?.sourceId === sourceId ? null : prev));
            return;
          }
          if (
            currentAssignment.columnId === targetColumnId &&
            currentAssignment.position === newPosition
          ) {
            return;
          }
          const fromColumnId = currentAssignment.columnId;
          const workItemId = currentAssignment.workItemId;

          assignmentsCol.update(sourceId, (draft) => {
            draft.columnId = targetColumnId;
            draft.position = newPosition;
          });

          if (onColumnChange && fromColumnId !== targetColumnId) {
            scheduleColumnChange(
              onColumnChange,
              workItemId,
              fromColumnId,
              targetColumnId,
              renderSettled,
            );
          }
        }, renderSettled);
      } finally {
        setDragInactiveWhenSettled(manager);
      }
    },
    [
      data.assignments,
      renderColumnItems,
      assignmentsCol,
      onColumnChange,
      trackDndRendering,
      setDragInactiveWhenSettled,
    ],
  );

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragMove={trackDndRendering}
      onDragOver={trackDndRendering}
      onDragEnd={handleDragEnd}
    >
      <DragOverlay className="pointer-events-none z-50">
        {(source: { id: unknown }) => {
          const sourceId = source.id;
          if (typeof sourceId !== "string") return null;
          const dragItem = assignmentItems.get(sourceId);
          if (!dragItem) return null;
          return (
            <div className="rounded-lg border-l-[3px] border border-border bg-card p-3 shadow-lg max-w-[360px]">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {dragItem.type}
              </div>
              <div className="text-sm font-medium leading-snug">{dragItem.title}</div>
            </div>
          );
        }}
      </DragOverlay>
      <div
        className="flex gap-3 p-4 overflow-x-auto bg-background"
        style={{ height: `calc(100vh - 49px - ${bottomOffset}px)` }}
      >
        <NewWorkColumn
          boardItems={renderColumnItems.get(NEW_WORK_COLUMN_ID) ?? []}
          isLoadingCandidates={isLoadingCandidates}
          onAddTask={onAddTask}
        />
        {columns.map((col) => (
          <BoardColumn
            key={col.id}
            id={col.id}
            name={col.name}
            items={renderColumnItems.get(col.id) ?? []}
            variant={col.id === COMPLETED_COLUMN_ID ? "completed" : "default"}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
