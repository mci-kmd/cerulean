import { useState } from "react";
import { Pencil } from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useBoardCollections } from "@/db/provider";
import { CopyableId } from "@/components/copyable-id";
import { getTypeStyle, getTypeIcon, CUSTOM_TASK_TYPE } from "@/lib/work-item-types";
import { TaskDialog } from "./task-dialog";
import type { WorkItem } from "@/types/board";

interface BoardCardProps {
  workItem: WorkItem;
  assignmentId: string;
  statusMessage?: string;
  index: number;
  columnId: string;
}

export function BoardCard({
  workItem,
  assignmentId,
  statusMessage,
  index,
  columnId,
}: BoardCardProps) {
  const { ref, isDragSource } = useSortable({
    id: assignmentId,
    index,
    group: columnId,
    data: { workItemId: workItem.id, columnId },
  });

  const { assignments, customTasks } = useBoardCollections();
  const [value, setValue] = useState(statusMessage ?? "");
  const [editOpen, setEditOpen] = useState(false);

  const isCustomTask = workItem.type === CUSTOM_TASK_TYPE && !workItem.url;

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (statusMessage ?? "")) {
      assignments.update(assignmentId, (draft: any) => {
        draft.statusMessage = trimmed || undefined;
      });
    }
  };

  const handleEditSave = (newTitle: string) => {
    const taskId = findCustomTaskId(workItem.id);
    if (taskId) {
      customTasks.update(taskId, (draft: any) => {
        draft.title = newTitle;
      });
    }
  };

  const handleDelete = () => {
    const taskId = findCustomTaskId(workItem.id);
    if (taskId) {
      customTasks.delete([taskId]);
      assignments.delete([assignmentId]);
    }
  };

  function findCustomTaskId(workItemId: number): string | null {
    const all = [...(customTasks as any).state.values()] as any[];
    const found = all.find((t) => t.workItemId === workItemId);
    return found?.id ?? null;
  }

  const style = getTypeStyle(workItem.type);
  const TypeIcon = getTypeIcon(workItem.type);

  return (
    <>
      <div
        ref={ref}
        className={`group/card rounded-lg border-l-[3px] border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all hover:-translate-y-px hover:shadow-md ${style.border} ${
          isDragSource ? "opacity-50 scale-[0.97]" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${style.text}`} />
          <span className="flex-1" />
          {isCustomTask ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/card:opacity-100"
              aria-label="Edit task"
            >
              <Pencil className="h-3 w-3" />
            </button>
          ) : (
            <CopyableId id={workItem.id} className="text-[10px]" />
          )}
        </div>
        {isCustomTask ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="block text-left text-sm font-medium leading-snug hover:underline mb-2 w-full"
          >
            {workItem.title}
          </button>
        ) : (
          <a
            href={workItem.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium leading-snug hover:underline mb-2"
            onClick={(e) => e.stopPropagation()}
          >
            {workItem.title}
          </a>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            placeholder="Set status..."
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 text-xs text-muted-foreground bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 placeholder:text-muted-foreground/40"
          />
        </div>
      </div>
      {isCustomTask && (
        <TaskDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          onSave={handleEditSave}
          onDelete={handleDelete}
          initialTitle={workItem.title}
          mode="edit"
        />
      )}
    </>
  );
}
