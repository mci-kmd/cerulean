import { CheckCircle2, Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/react";
import { BoardCard } from "./board-card";
import type { WorkItem, ColumnAssignment } from "@/types/board";

export type ColumnVariant = "default" | "completed";

interface BoardColumnProps {
  id: string;
  name: string;
  items: { assignment: ColumnAssignment; workItem: WorkItem | undefined }[];
  onAddTask?: (columnId: string) => void;
  variant?: ColumnVariant;
}

const variantStyles: Record<ColumnVariant, { container: string; badge: string }> = {
  default: {
    container: "bg-muted/30 border-t-2 border-t-border",
    badge: "bg-primary/10 text-primary",
  },
  completed: {
    container: "bg-emerald-50/50 dark:bg-emerald-950/20 border-t-2 border-t-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
};

export function BoardColumn({ id, name, items, onAddTask, variant = "default" }: BoardColumnProps) {
  const { ref } = useDroppable({ id, type: "column" });
  const styles = variantStyles[variant];

  return (
    <div
      data-column-id={id}
      className={`flex flex-col flex-1 min-w-[260px] max-w-[380px] rounded-lg shrink-0 ${styles.container}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {variant === "completed" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <h2 className="text-sm font-medium font-heading">{name}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {onAddTask && variant !== "completed" && (
            <button
              type="button"
              onClick={() => onAddTask(id)}
              className="text-muted-foreground hover:text-amber-600 transition-colors rounded p-0.5 hover:bg-amber-50"
              aria-label={`Add task to ${name}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${styles.badge}`}>
            {items.length}
          </span>
        </div>
      </div>
      <div ref={ref} className="flex-1 px-2 pb-2 overflow-y-auto space-y-2 min-h-[100px]">
        {items.map((item, index) =>
          item.workItem ? (
            <BoardCard
              key={item.assignment.id}
              workItem={item.workItem}
              assignmentId={item.assignment.id}
              statusMessage={item.assignment.statusMessage}
              mockupUrl={item.assignment.mockupUrl}
              index={index}
              columnId={id}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
