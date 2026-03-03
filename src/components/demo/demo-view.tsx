import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DemoItem } from "./demo-item";
import { useDemoWorkItems } from "@/hooks/use-demo-work-items";
import { useDemoApprove } from "@/hooks/use-demo-approve";
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

  const unapproved = items.filter((i) => !approvedIds.has(i.id));
  const approved = items.filter((i) => approvedIds.has(i.id));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-2">
      {unapproved.map((item) => (
        <DemoItem
          key={item.id}
          item={item}
          isActive={activeId === item.id}
          isApproved={false}
          onSelect={() =>
            setActiveId(activeId === item.id ? null : item.id)
          }
          onApprove={() => handleApprove(item.id)}
          onUnapprove={() => {}}
        />
      ))}
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
