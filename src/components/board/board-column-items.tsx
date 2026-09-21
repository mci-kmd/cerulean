import { useState } from "react";
import { ChevronDown, Layers3 } from "lucide-react";
import { BoardCard } from "./board-card";
import { isUiReviewWorkItem, type ColumnAssignment, type WorkItem } from "@/types/board";

export type BoardColumnItem = {
  assignment: ColumnAssignment;
  workItem: WorkItem;
};

interface BoardColumnItemsProps {
  items: BoardColumnItem[];
  columnId: string;
}

function renderCard(item: BoardColumnItem, index: number, columnId: string) {
  return (
    <BoardCard
      key={item.assignment.id}
      workItem={item.workItem}
      assignmentId={item.assignment.id}
      statusMessage={item.assignment.statusMessage}
      mockupUrl={item.assignment.mockupUrl}
      discussionUrl={item.assignment.discussionUrl}
      candidateOptOut={item.assignment.candidateOptOut}
      index={index}
      columnId={columnId}
    />
  );
}

export function BoardColumnItems({ items, columnId }: BoardColumnItemsProps) {
  const [expandedFeatures, setExpandedFeatures] = useState<Set<number>>(new Set());
  const featureGroups = new Map<number, { title: string; items: { item: BoardColumnItem; index: number }[] }>();

  items.forEach((item, index) => {
    if (!isUiReviewWorkItem(item.workItem)) return;
    const feature = item.workItem.uiReview.parentFeature;
    if (!feature) return;
    const group = featureGroups.get(feature.id) ?? { title: feature.title, items: [] };
    group.items.push({ item, index });
    featureGroups.set(feature.id, group);
  });

  const groupedAssignmentIds = new Set(
    [...featureGroups.values()]
      .filter((group) => group.items.length > 1)
      .flatMap((group) => group.items.map(({ item }) => item.assignment.id)),
  );
  const renderedFeatures = new Set<number>();

  return items.map((item, index) => {
    if (!groupedAssignmentIds.has(item.assignment.id)) {
      return renderCard(item, index, columnId);
    }

    const feature = isUiReviewWorkItem(item.workItem)
      ? item.workItem.uiReview.parentFeature
      : undefined;
    if (!feature || renderedFeatures.has(feature.id)) return null;
    renderedFeatures.add(feature.id);

    const group = featureGroups.get(feature.id);
    if (!group) return null;
    const expanded = expandedFeatures.has(feature.id);
    const toggleExpanded = () => {
      setExpandedFeatures((current) => {
        const next = new Set(current);
        if (next.has(feature.id)) next.delete(feature.id);
        else next.add(feature.id);
        return next;
      });
    };

    return (
      <div key={`feature-${feature.id}`} className="relative">
        {!expanded && (
          <>
            <div className="absolute inset-x-2 top-1 h-full rounded-lg border bg-card/80" />
            <div className="absolute inset-x-1 top-0.5 h-full rounded-lg border bg-card/90" />
          </>
        )}
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={`feature-${columnId}-${feature.id}`}
          className="relative z-10 flex w-full items-center gap-2 rounded-lg border border-primary/25 bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-accent/30"
        >
          <Layers3 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{group.title}</span>
            <span className="block text-xs text-muted-foreground">
              {group.items.length} UI review items
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        <div
          id={`feature-${columnId}-${feature.id}`}
          aria-hidden={!expanded}
          inert={!expanded}
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="ml-3 space-y-2 border-l-2 border-primary/25 pb-1 pl-2 pt-2">
              {group.items.map(({ item: child, index: childIndex }) =>
                renderCard(child, childIndex, columnId),
              )}
            </div>
          </div>
        </div>
      </div>
    );
  });
}
