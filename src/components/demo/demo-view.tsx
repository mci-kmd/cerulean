import { type ComponentProps, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { DemoItem } from "./demo-item";
import { SortableDemoItem } from "./sortable-demo-item";
import { useDemoWorkItems } from "@/hooks/use-demo-work-items";
import { useDemoApprove } from "@/hooks/use-demo-approve";
import { useDemoOrder } from "@/hooks/use-demo-order";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import type { AdoClient } from "@/api/ado-client";

interface DemoViewProps {
  client: AdoClient;
  approvalState: string;
  closedState: string;
  org: string;
  project: string;
}

type DemoDragEndEvent = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[0];

export function DemoView({
  client,
  approvalState,
  closedState,
  org,
  project,
}: DemoViewProps) {
  const { items, isLoading, error } = useDemoWorkItems(
    client,
    approvalState,
    org,
    project,
    true,
  );
  const approveMutation = useDemoApprove(client);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<number>>(new Set());
  const { sortedItems, reorder } = useDemoOrder(items);

  const handleApprove = useCallback(
    (workItemId: number) => {
      setApprovedIds((prev) => new Set(prev).add(workItemId));
      setActiveId(null);
      approveMutation.mutate(
        { workItemId, targetState: closedState },
        {
          onError: (err) => {
            setApprovedIds((prev) => {
              const next = new Set(prev);
              next.delete(workItemId);
              return next;
            });
            toast.error("Failed to approve", {
              description: err.message,
            });
          },
        },
      );
    },
    [approveMutation, closedState],
  );

  const handleUnapprove = useCallback(
    (workItemId: number) => {
      setApprovedIds((prev) => {
        const next = new Set(prev);
        next.delete(workItemId);
        return next;
      });
      approveMutation.mutate(
        { workItemId, targetState: approvalState },
        {
          onError: (err) => {
            setApprovedIds((prev) => new Set(prev).add(workItemId));
            toast.error("Failed to unapprove", {
              description: err.message,
            });
          },
        },
      );
    },
    [approveMutation, approvalState],
  );

  const handleDragEnd = useCallback(
    (event: DemoDragEndEvent) => {
      if (event.canceled) return;
      const { source, target } = event.operation;
      if (!source || !target) return;

      const targetRecord = target as unknown as Record<string, unknown>;
      const sourceId = Number(source.id);
      if (!Number.isFinite(sourceId)) return;

      const targetIndex = typeof targetRecord.index === "number"
        ? targetRecord.index
        : undefined;
      if (targetIndex === undefined) return;

      const unapprovedIds = sortedItems
        .filter((i) => !approvedIds.has(i.id))
        .map((i) => i.id);
      scheduleDndMutation(() => reorder(sourceId, targetIndex, unapprovedIds));
    },
    [reorder, sortedItems, approvedIds],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Failed to load demo items: {error.message}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No items in &quot;{approvalState}&quot; state
      </div>
    );
  }

  const unapproved = sortedItems.filter((i) => !approvedIds.has(i.id));
  const approved = sortedItems.filter((i) => approvedIds.has(i.id));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <DragDropProvider onDragEnd={handleDragEnd}>
        {unapproved.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pending Review
              </h3>
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                {unapproved.length}
              </span>
            </div>
            {unapproved.map((item, index) => (
              <SortableDemoItem
                key={item.id}
                item={item}
                index={index}
                isActive={activeId === item.id}
                isApproved={false}
                onSelect={() =>
                  setActiveId(activeId === item.id ? null : item.id)
                }
                onApprove={() => handleApprove(item.id)}
                onUnapprove={() => {}}
              />
            ))}
          </div>
        )}
      </DragDropProvider>

      {approved.length > 0 && (
        <div className="space-y-1.5">
          {unapproved.length > 0 && <Separator />}
          <div className="flex items-center gap-2 px-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Approved
            </h3>
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
              {approved.length}
            </span>
          </div>
          {approved.map((item) => (
            <DemoItem
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              isApproved={true}
              onSelect={() =>
                setActiveId(activeId === item.id ? null : item.id)
              }
              onApprove={() => {}}
              onUnapprove={() => handleUnapprove(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <div className="border-t my-2" />;
}
