import { Inbox, Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/react";
import { BoardCard } from "./board-card";
import { NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import type { ColumnAssignment, WorkItem } from "@/types/board";

interface NewWorkColumnProps {
  boardItems: { assignment: ColumnAssignment; workItem: WorkItem | undefined }[];
  isLoadingCandidates: boolean;
  onAddTask?: () => void;
}

export function NewWorkColumn({
  boardItems,
  isLoadingCandidates,
  onAddTask,
}: NewWorkColumnProps) {
  const { ref } = useDroppable({ id: NEW_WORK_COLUMN_ID, type: "column" });

  const boardCards = boardItems.filter(
    (item): item is { assignment: ColumnAssignment; workItem: WorkItem } =>
      item.workItem !== undefined,
  );
  const count = boardCards.length;

  return (
    <div className="flex flex-col flex-1 min-w-[260px] max-w-[380px] rounded-lg shrink-0 bg-muted/30 border-t-2 border-t-border">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Inbox className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-medium font-heading">New Work</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {onAddTask && (
            <button
              type="button"
              onClick={onAddTask}
              className="text-muted-foreground hover:text-amber-600 transition-colors rounded p-0.5 hover:bg-amber-50"
              aria-label="Add task to New Work"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
            {count}
          </span>
        </div>
      </div>
      <div ref={ref} className="flex-1 px-2 pb-2 overflow-y-auto space-y-2 min-h-[100px]">
        {boardCards.map((item, index) => (
          <BoardCard
            key={item.assignment.id}
            workItem={item.workItem}
            assignmentId={item.assignment.id}
            statusMessage={item.assignment.statusMessage}
            index={index}
            columnId={NEW_WORK_COLUMN_ID}
          />
        ))}
        {isLoadingCandidates && boardCards.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="w-full h-[130px] rounded-lg bg-muted animate-pulse"
            />
          ))
        ) : boardCards.length === 0 ? (
          <div className="flex items-center justify-center w-full text-sm text-muted-foreground h-20">
            No candidate items found
          </div>
        ) : null}
      </div>
    </div>
  );
}
