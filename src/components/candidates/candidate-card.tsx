import { createElement } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTypeStyle, getTypeIcon } from "@/lib/work-item-types";
import { cn } from "@/lib/utils";
import type { WorkItem } from "@/types/board";

interface CandidateCardProps {
  workItem: WorkItem;
  onStart: (id: number) => void;
  isStarting: boolean;
  className?: string;
}

export function CandidateCard({
  workItem,
  onStart,
  isStarting,
  className,
}: CandidateCardProps) {
  const style = getTypeStyle(workItem.type);
  const typeIcon = getTypeIcon(workItem.type);

  return (
    <div
      className={cn(
        "w-60 shrink-0 rounded-lg border-l-[3px] border border-border bg-card p-3 shadow-sm",
        style.border,
        className,
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {createElement(typeIcon, {
          className: `h-3.5 w-3.5 shrink-0 ${style.text}`,
        })}
        <span className="text-[10px] text-muted-foreground">#{workItem.id}</span>
      </div>
      <a
        href={workItem.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium leading-snug line-clamp-2 mb-2 hover:underline"
      >
        {workItem.title}
      </a>
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
