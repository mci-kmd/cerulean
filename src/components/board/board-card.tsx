import { useState } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useBoardCollections } from "@/db/provider";
import { getTypeStyle, getTypeIcon } from "@/lib/work-item-types";
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

  const { assignments } = useBoardCollections();
  const [value, setValue] = useState(statusMessage ?? "");

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (statusMessage ?? "")) {
      assignments.update(assignmentId, (draft: any) => {
        draft.statusMessage = trimmed || undefined;
      });
    }
  };

  const style = getTypeStyle(workItem.type);
  const TypeIcon = getTypeIcon(workItem.type);

  return (
    <div
      ref={ref}
      className={`rounded-lg border-l-[3px] border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all hover:-translate-y-px hover:shadow-md ${style.border} ${
        isDragSource ? "opacity-50 scale-[0.97]" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${style.text}`} />
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
          #{workItem.id}
        </span>
      </div>
      <a
        href={workItem.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium leading-snug hover:underline mb-2"
        onClick={(e) => e.stopPropagation()}
      >
        {workItem.title}
      </a>
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
  );
}
