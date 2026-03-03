import { useState } from "react";
import { ChevronUp, ChevronDown, Inbox } from "lucide-react";
import { CandidateCard } from "./candidate-card";
import { useCandidates } from "@/hooks/use-candidates";
import { useStartWork } from "@/hooks/use-start-work";
import type { AdoClient } from "@/api/ado-client";

interface CandidateTrayProps {
  client: AdoClient;
  candidateState: string;
  sourceState: string;
  org: string;
  project: string;
  areaPath?: string;
  workItemTypes?: string;
  onExpandChange?: (expanded: boolean) => void;
}

export function CandidateTray({
  client,
  candidateState,
  sourceState,
  org,
  project,
  areaPath,
  workItemTypes,
  onExpandChange,
}: CandidateTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const { candidates, isLoading } = useCandidates(
    client,
    candidateState,
    org,
    project,
    expanded,
    areaPath,
    workItemTypes,
  );
  const startWork = useStartWork(client);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
  };

  const Chevron = expanded ? ChevronDown : ChevronUp;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-background border-t border-border transition-[height] duration-200 ease-in-out z-40"
      style={{ height: expanded ? 220 : 40 }}
    >
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-4 h-10 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label={expanded ? "Collapse candidate tray" : "Expand candidate tray"}
      >
        <Inbox className="h-4 w-4" />
        <span>New Work</span>
        {candidates.length > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {candidates.length}
          </span>
        )}
        <span className="flex-1" />
        <Chevron className="h-4 w-4" />
      </button>

      {expanded && (
        <div className="flex gap-3 px-4 pb-3 overflow-x-auto h-[180px] items-start">
          {isLoading && candidates.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="w-60 h-[140px] shrink-0 rounded-lg bg-muted animate-pulse"
              />
            ))
          ) : candidates.length === 0 ? (
            <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
              No candidate items found
            </div>
          ) : (
            candidates.map((item) => (
              <CandidateCard
                key={item.id}
                workItem={item}
                onStart={(id) =>
                  startWork.mutate({ workItemId: id, targetState: sourceState })
                }
                isStarting={
                  startWork.isPending &&
                  startWork.variables?.workItemId === item.id
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
