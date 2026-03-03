import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Board } from "@/components/board/board";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { EmptyState } from "@/components/board/empty-state";
import { DemoView } from "@/components/demo/demo-view";
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
  const [demoMode, setDemoMode] = useState(false);

  const client: AdoClient | null = (() => {
    if (!settings?.pat || !settings?.org || !settings?.project) return null;
    return createAdoClient({
      pat: settings.pat,
      org: settings.org,
      project: settings.project,
    });
  })();

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
  const showDemoButton = !!settings?.approvalState;

  if (!hasSettings || !hasColumns) {
    return (
      <TooltipProvider>
        <div className="min-h-screen">
          <Header onOpenSettings={() => setSettingsOpen(true)} />
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
          hasError={!!error}
          demoMode={demoMode}
          onToggleDemo={() => setDemoMode((d) => !d)}
          showDemoButton={showDemoButton}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {demoMode && client ? (
          <DemoView
            client={client}
            approvalState={settings.approvalState}
            closedState={settings.closedState}
            org={settings.org}
            project={settings.project}
          />
        ) : isLoading && workItems.length === 0 ? (
          <BoardSkeleton columnCount={columns.length} />
        ) : (
          <Board data={boardData} />
        )}
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
