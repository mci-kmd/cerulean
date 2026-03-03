import { useState, useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Board } from "@/components/board/board";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { EmptyState } from "@/components/board/empty-state";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useBoardCollections } from "@/db/provider";
import { useBoard, useSettings, useColumns, useAssignments } from "@/hooks/use-board";
import { useWorkItems } from "@/hooks/use-work-items";
import { useReconcile } from "@/hooks/use-reconcile";
import { createAdoClient, type AdoClient } from "@/api/ado-client";

export function App() {
  const collections = useBoardCollections();
  const settings = useSettings();
  const columns = useColumns();
  const assignments = useAssignments();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const client: AdoClient | null = useMemo(() => {
    if (!settings?.pat || !settings?.org || !settings?.project) return null;
    return createAdoClient({
      pat: settings.pat,
      org: settings.org,
      project: settings.project,
    });
  }, [settings?.pat, settings?.org, settings?.project]);

  const { workItems, isLoading, error, refetch, dataUpdatedAt } =
    useWorkItems(
      client,
      settings?.sourceState ?? "",
      settings?.org ?? "",
      settings?.project ?? "",
      settings?.pollInterval ?? 30,
    );

  useReconcile(workItems, assignments, columns, collections);

  if (error) {
    toast.error("Failed to fetch work items", {
      description: error.message,
      id: "fetch-error",
    });
  }

  const boardData = useBoard(workItems);
  const hasSettings = !!(settings?.pat && settings?.org && settings?.project);
  const hasColumns = columns.length > 0;

  if (!hasSettings || !hasColumns) {
    return (
      <TooltipProvider>
        <div className="min-h-screen">
          <Header />
          <EmptyState
            hasSettings={hasSettings}
            hasColumns={hasColumns}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
          <Toaster />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <Header
          onRefresh={() => refetch()}
          isRefreshing={isLoading}
          lastUpdated={dataUpdatedAt}
        />
        {isLoading && workItems.length === 0 ? (
          <BoardSkeleton columnCount={columns.length} />
        ) : (
          <Board data={boardData} />
        )}
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
