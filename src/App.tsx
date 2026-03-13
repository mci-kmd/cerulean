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
import { useCandidates } from "@/hooks/use-candidates";
import { useStartWork } from "@/hooks/use-start-work";
import { useReturnToCandidate } from "@/hooks/use-return-to-candidate";
import { createAdoClient, type AdoClient } from "@/api/ado-client";
import { isReconcileReady } from "@/logic/reconcile-readiness";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";

export function App() {
  const collections = useBoardCollections();
  const settings = useSettings();
  const columns = useColumns();
  const assignments = useAssignments();
  const customTasks = useCustomTasks();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

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
  const returnToCandidate = useReturnToCandidate(client);
  const startWork = useStartWork(client);
  const canLoadCandidates =
    !demoMode &&
    !!client &&
    !!settings?.candidateState &&
    !!settings?.org &&
    !!settings?.project;
  const { candidates, isLoading: isLoadingCandidates } = useCandidates(
    client,
    settings?.candidateState ?? "",
    settings?.org ?? "",
    settings?.project ?? "",
    canLoadCandidates,
    settings?.areaPath,
    settings?.workItemTypes,
  );

  const customWorkItems = useMemo(
    () => customTasksToWorkItems(customTasks, settings?.approvalState),
    [customTasks, settings?.approvalState],
  );

  const workItems = useMemo(
    () => [...adoWorkItems, ...completedAdoItems, ...customWorkItems],
    [adoWorkItems, completedAdoItems, customWorkItems],
  );
  const boardWorkItems = useMemo(() => {
    const merged = new Map<number, (typeof workItems)[number]>();
    for (const item of workItems) {
      merged.set(item.id, item);
    }
    for (const item of candidates) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item);
      }
    }
    return [...merged.values()];
  }, [workItems, candidates]);
  const reconcileReady = isReconcileReady(
    isSuccess,
    completedSuccess,
    settings?.approvalState,
  );

  useReconcile(
    boardWorkItems,
    assignments,
    columns,
    collections,
    reconcileReady,
    settings?.approvalState,
    settings?.candidateState,
  );

  if (error) {
    toast.error("Failed to fetch work items", {
      description: error.message,
      id: "fetch-error",
    });
  }

  const boardData = useBoard(boardWorkItems);
  const hasSettings = !!(settings?.pat && settings?.org && settings?.project);
  const hasColumns = columns.length > 0;
  const showDemoButton = !!settings?.approvalState;

  const handleAddTask = useCallback(() => {
    setTaskDialogOpen(true);
  }, []);

  const handleCreateTask = useCallback(
    (title: string) => {
      const workItemId = -Date.now();
      const taskId = nanoid();
      const assignmentId = nanoid();

      collections.customTasks.insert({ id: taskId, workItemId, title });

      const colItems = boardData.assignments.filter(
        (a) => a.columnId === NEW_WORK_COLUMN_ID,
      );
      const maxPos = colItems.reduce((max, a) => Math.max(max, a.position), 0);

      collections.assignments.insert({
        id: assignmentId,
        workItemId,
        columnId: NEW_WORK_COLUMN_ID,
        position: maxPos + 1,
      });
    },
    [collections, boardData.assignments],
  );

  const handleColumnChange = (workItemId: number, fromColumnId: string, toColumnId: string) => {
    if (fromColumnId === toColumnId) return;

    const customTask = collections.customTasks.toArray.find(
      (t) => t.workItemId === workItemId,
    );
    const isCustom = workItemId < 0 || !!customTask;

    if (isCustom) {
      if (!customTask) return;
      if (!collections.customTasks.get(customTask.id)) return;

      if (toColumnId === COMPLETED_COLUMN_ID) {
        scheduleDndMutation(() => {
          if (!collections.customTasks.get(customTask.id)) return;
          collections.customTasks.update(customTask.id, (draft) => {
            draft.completedAt = Date.now();
          });
        });
      } else if (fromColumnId === COMPLETED_COLUMN_ID) {
        scheduleDndMutation(() => {
          if (!collections.customTasks.get(customTask.id)) return;
          collections.customTasks.update(customTask.id, (draft) => {
            draft.completedAt = undefined;
          });
        });
      }
      return;
    }

    const movingToNewWork = toColumnId === NEW_WORK_COLUMN_ID;
    const movingFromNewWork = fromColumnId === NEW_WORK_COLUMN_ID;
    const movingToCompleted =
      toColumnId === COMPLETED_COLUMN_ID &&
      fromColumnId !== COMPLETED_COLUMN_ID;
    const movingFromCompleted =
      fromColumnId === COMPLETED_COLUMN_ID &&
      toColumnId !== COMPLETED_COLUMN_ID;

    if (movingToNewWork) {
      if (!settings?.candidateState) return;
      returnToCandidate.mutate(
        { workItemId, targetState: settings.candidateState },
        {
          onError: (err) =>
            toast.error("Failed to return work item", {
              description: err.message,
              id: `return-error-${workItemId}`,
            }),
        },
      );
      return;
    }

    if (movingFromNewWork) {
      if (!settings?.sourceState) return;
      startWork.mutate(
        {
          workItemId,
          targetState: settings.sourceState,
          optimisticRemoveFromCandidates: false,
        },
        {
          onError: (err) =>
            toast.error("Failed to start work item", {
              description: err.message,
              id: `start-error-${workItemId}`,
            }),
        },
      );
      return;
    }

    if (movingToCompleted) {
      if (!settings?.approvalState) return;
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
      return;
    }

    if (movingFromCompleted) {
      if (!settings?.sourceState) return;
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
            isLoadingCandidates={isLoadingCandidates}
            onAddTask={handleAddTask}
            onColumnChange={handleColumnChange}
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
