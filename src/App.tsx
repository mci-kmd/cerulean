import { useState, useMemo, useCallback } from "react";
import { nanoid } from "nanoid";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Board } from "@/components/board/board";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { EmptyState } from "@/components/board/empty-state";
import { DemoView } from "@/components/demo/demo-view";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { TaskDialog } from "@/components/board/task-dialog";
import { useBoardCollections } from "@/db/use-board-collections";
import { useBoard, useSettings, useColumns, useAssignments } from "@/hooks/use-board";
import { useWorkItems } from "@/hooks/use-work-items";
import { useCompletedWorkItems } from "@/hooks/use-completed-work-items";
import { useCompleteWorkItem } from "@/hooks/use-complete-work-item";
import { useReconcile } from "@/hooks/use-reconcile";
import { useCustomTasks, customTasksToWorkItems } from "@/hooks/use-custom-tasks";
import { CandidateTray } from "@/components/candidates/candidate-tray";
import { createAdoClient, type AdoClient } from "@/api/ado-client";
import { isReconcileReady } from "@/logic/reconcile-readiness";
import { COMPLETED_COLUMN_ID } from "@/types/board";

export function App() {
  const collections = useBoardCollections();
  const settings = useSettings();
  const columns = useColumns();
  const assignments = useAssignments();
  const customTasks = useCustomTasks();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTargetColumn, setTaskTargetColumn] = useState<string | null>(null);

  const client: AdoClient | null = (() => {
    if (!settings?.pat || !settings?.org || !settings?.project) return null;
    return createAdoClient({
      pat: settings.pat,
      org: settings.org,
      project: settings.project,
    });
  })();

  const { workItems: adoWorkItems, isLoading, isSuccess, error, refetch, dataUpdatedAt } =
    useWorkItems(
      client,
      settings?.sourceState ?? "",
      settings?.org ?? "",
      settings?.project ?? "",
      settings?.pollInterval ?? 30,
      settings?.areaPath,
      settings?.workItemTypes,
    );

  const { workItems: completedAdoItems, isSuccess: completedSuccess } =
    useCompletedWorkItems(
      client,
      settings?.approvalState ?? "",
      settings?.org ?? "",
      settings?.project ?? "",
      settings?.pollInterval ?? 30,
      settings?.areaPath,
      settings?.workItemTypes,
    );

  const completeWorkItem = useCompleteWorkItem(client);

  const customWorkItems = useMemo(
    () => customTasksToWorkItems(customTasks, settings?.approvalState),
    [customTasks, settings?.approvalState],
  );

  const workItems = useMemo(
    () => [...adoWorkItems, ...completedAdoItems, ...customWorkItems],
    [adoWorkItems, completedAdoItems, customWorkItems],
  );
  const reconcileReady = isReconcileReady(
    isSuccess,
    completedSuccess,
    settings?.approvalState,
  );

  useReconcile(
    workItems,
    assignments,
    columns,
    collections,
    reconcileReady,
    settings?.approvalState,
  );

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
  const showCandidateTray = !demoMode && !!client && !!settings?.candidateState;
  const trayHeight = showCandidateTray ? (trayExpanded ? 220 : 40) : 0;

  const handleAddTask = useCallback((columnId: string) => {
    setTaskTargetColumn(columnId);
    setTaskDialogOpen(true);
  }, []);

  const handleCreateTask = useCallback(
    (title: string) => {
      if (!taskTargetColumn) return;
      const workItemId = -Date.now();
      const taskId = nanoid();
      const assignmentId = nanoid();

      collections.customTasks.insert({ id: taskId, workItemId, title });

      const colItems = boardData.assignments.filter(
        (a) => a.columnId === taskTargetColumn,
      );
      const maxPos = colItems.reduce((max, a) => Math.max(max, a.position), 0);

      collections.assignments.insert({
        id: assignmentId,
        workItemId,
        columnId: taskTargetColumn,
        position: maxPos + 1,
      });
    },
    [taskTargetColumn, collections, boardData.assignments],
  );

  const handleColumnChange = (workItemId: number, fromColumnId: string, toColumnId: string) => {
    const isCustom = customTasks.some((t) => t.workItemId === workItemId);

    if (isCustom) {
      const task = customTasks.find((t) => t.workItemId === workItemId);
      if (!task) return;

      if (toColumnId === COMPLETED_COLUMN_ID) {
        collections.customTasks.update(task.id, (draft: { completedAt?: number }) => {
          draft.completedAt = Date.now();
        });
      } else if (fromColumnId === COMPLETED_COLUMN_ID) {
        collections.customTasks.update(task.id, (draft: { completedAt?: number }) => {
          draft.completedAt = undefined;
        });
      }
      return;
    }

    if (!settings?.approvalState || !settings?.sourceState) return;

    if (toColumnId === COMPLETED_COLUMN_ID && fromColumnId !== COMPLETED_COLUMN_ID) {
      completeWorkItem.mutate(
        { workItemId, targetState: settings.approvalState },
        {
          onError: (err) =>
            toast.error("Failed to update work item state", {
              description: err.message,
              id: `complete-error-${workItemId}`,
            }),
        },
      );
    } else if (fromColumnId === COMPLETED_COLUMN_ID && toColumnId !== COMPLETED_COLUMN_ID) {
      completeWorkItem.mutate(
        { workItemId, targetState: settings.sourceState },
        {
          onError: (err) =>
            toast.error("Failed to update work item state", {
              description: err.message,
              id: `uncomplete-error-${workItemId}`,
            }),
        },
      );
    }
  };

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
          <Board
            data={boardData}
            bottomOffset={trayHeight}
            onAddTask={handleAddTask}
            onColumnChange={handleColumnChange}
          />
        )}
        {showCandidateTray && (
          <CandidateTray
            client={client!}
            candidateState={settings!.candidateState}
            sourceState={settings!.sourceState}
            org={settings!.org}
            project={settings!.project}
            areaPath={settings!.areaPath}
            workItemTypes={settings!.workItemTypes}
            onExpandChange={setTrayExpanded}
          />
        )}
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <TaskDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          onSave={handleCreateTask}
          mode="create"
        />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
