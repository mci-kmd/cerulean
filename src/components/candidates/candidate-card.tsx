import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTypeStyle, getTypeIcon } from "@/lib/work-item-types";
import type { WorkItem } from "@/types/board";

interface CandidateCardProps {
  workItem: WorkItem;
  onStart: (id: number) => void;
  isStarting: boolean;
}

export function CandidateCard({ workItem, onStart, isStarting }: CandidateCardProps) {
  const style = getTypeStyle(workItem.type);
  const TypeIcon = getTypeIcon(workItem.type);

  return (
    <div
      className={`w-60 shrink-0 rounded-lg border-l-[3px] border border-border bg-card p-3 shadow-sm ${style.border}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${style.text}`} />
        <span className="text-[10px] text-muted-foreground">#{workItem.id}</span>
      </div>
      <p className="text-sm font-medium leading-snug line-clamp-2 mb-2">
        {workItem.title}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        disabled={isStarting}
        onClick={() => onStart(workItem.id)}
      >
        {isStarting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <Play className="h-3 w-3 mr-1" />
            Start
          </>
        )}
      </Button>
    </div>
  );
}
