import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { DemoItem } from "./demo-item";
import { SortableDemoItem } from "./sortable-demo-item";
import { useDemoWorkItems } from "@/hooks/use-demo-work-items";
import { useDemoApprove } from "@/hooks/use-demo-approve";
import { useDemoOrder } from "@/hooks/use-demo-order";
import type { AdoClient } from "@/api/ado-client";

interface DemoViewProps {
  client: AdoClient;
  approvalState: string;
  closedState: string;
  org: string;
  project: string;
}

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
    (event: { canceled: boolean; operation: { source: any; target: any } }) => {
      if (event.canceled) return;
      const { source, target } = event.operation;
      if (!source || !target) return;

      const sourceId = source.id as number;
      const targetIndex = target.index as number | undefined;
      if (targetIndex === undefined) return;

      const unapprovedIds = sortedItems
        .filter((i) => !approvedIds.has(i.id))
        .map((i) => i.id);
      reorder(sourceId, targetIndex, unapprovedIds);
    },
    [reorder, sortedItems, approvedIds],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        No items in "{approvalState}" state
      </div>
    );
  }

  const unapproved = sortedItems.filter((i) => !approvedIds.has(i.id));
  const approved = sortedItems.filter((i) => approvedIds.has(i.id));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-2">
      <DragDropProvider onDragEnd={handleDragEnd}>
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
      </DragDropProvider>
      {approved.length > 0 && unapproved.length > 0 && (
        <div className="border-t pt-2 mt-4" />
      )}
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
  );
}
