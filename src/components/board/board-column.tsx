import { useDroppable } from "@dnd-kit/react";
import { BoardCard } from "./board-card";
import type { WorkItem, ColumnAssignment } from "@/types/board";

interface BoardColumnProps {
  id: string;
  name: string;
  items: { assignment: ColumnAssignment; workItem: WorkItem | undefined }[];
}

export function BoardColumn({ id, name, items }: BoardColumnProps) {
  const { ref } = useDroppable({ id, type: "column" });

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] bg-muted/50 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h2 className="text-sm font-medium">{name}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div ref={ref} className="flex-1 p-2 overflow-y-auto space-y-2 min-h-[100px]">
        {items.map((item, index) =>
          item.workItem ? (
            <BoardCard
              key={item.assignment.id}
              workItem={item.workItem}
              assignmentId={item.assignment.id}
              statusMessage={item.assignment.statusMessage}
              index={index}
              columnId={id}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
