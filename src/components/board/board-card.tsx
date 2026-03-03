import { useSortable } from "@dnd-kit/react/sortable";
import { Badge } from "@/components/ui/badge";
import type { WorkItem } from "@/types/board";

const TYPE_COLORS: Record<string, string> = {
  Bug: "bg-red-100 text-red-800 border-red-200",
  "User Story": "bg-blue-100 text-blue-800 border-blue-200",
  Task: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Feature: "bg-purple-100 text-purple-800 border-purple-200",
  Epic: "bg-orange-100 text-orange-800 border-orange-200",
};

interface BoardCardProps {
  workItem: WorkItem;
  assignmentId: string;
  index: number;
  columnId: string;
}

export function BoardCard({
  workItem,
  assignmentId,
  index,
  columnId,
}: BoardCardProps) {
  const { ref, isDragSource } = useSortable({
    id: assignmentId,
    index,
    group: columnId,
    data: { workItemId: workItem.id, columnId },
  });

  const typeColor =
    TYPE_COLORS[workItem.type] ?? "bg-gray-100 text-gray-800 border-gray-200";

  return (
    <div
      ref={ref}
      className={`rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-opacity ${
        isDragSource ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeColor}`}>
          {workItem.type}
        </Badge>
        <span className="text-[10px] text-muted-foreground shrink-0">
          #{workItem.id}
        </span>
      </div>
      <a
        href={workItem.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium leading-snug hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {workItem.title}
      </a>
    </div>
  );
}
