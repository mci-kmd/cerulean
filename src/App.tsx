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
import { useCandidateBoardConfig } from "@/hooks/use-candidate-board-config";
import { useStartWork } from "@/hooks/use-start-work";
import { useReturnToCandidate } from "@/hooks/use-return-to-candidate";
import { useReviewWorkItems } from "@/hooks/use-review-work-items";
import { useGithubReviewWorkItems } from "@/hooks/use-github-review-work-items";
import { useReviewPullRequest } from "@/hooks/use-review-pull-request";
import { createAdoClient, type AdoClient } from "@/api/ado-client";
import { isReconcileReady } from "@/logic/reconcile-readiness";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import { getGithubReviewPlacement } from "@/lib/github-review-placement";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import {
  getBoardColumnTargetState,
  isBoardColumnSplit,
  type CandidateBoardConfig,
} from "@/lib/ado-board";
import { isReviewWorkItem } from "@/types/board";

function getTargetBoardColumnUpdate(
  boardConfig: CandidateBoardConfig | undefined,
  columnName: string | undefined,
) {
  if (!boardConfig || !columnName) return {};

  return {
    targetBoardColumnField: boardConfig.columnFieldReferenceName,
    targetBoardColumnName: columnName,
    ...(isBoardColumnSplit(boardConfig, columnName) && boardConfig.doneFieldReferenceName
      ? {
          targetBoardDoneField: boardConfig.doneFieldReferenceName,
          targetBoardDoneValue: false,
        }
      : {}),
  };
}

interface BoardTransition {
  workItemId: number;
  targetState: string;
  targetBoardColumnField?: string;
  targetBoardColumnName?: string;
  targetBoardDoneField?: string;
  targetBoardDoneValue?: boolean;
}

export function App() {
  const collections = useBoardCollections();
  const settings = useSettings();
  const columns = useColumns();
  const assignments = useAssignments();
  const customTasks = useCustomTasks();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [isBoardDragging, setIsBoardDragging] = useState(false);

  const client: AdoClient | null = (() => {
    if (!settings?.pat || !settings?.org || !settings?.project) return null;
    return createAdoClient({
      pat: settings.pat,
      org: settings.org,
      project: settings.project,
    });
  })();

  const resolvedTeam = settings?.team?.trim() ?? "";
  const preferredBoardColumnNames = [
    settings?.candidateBoardColumn?.trim(),
    settings?.sourceBoardColumn?.trim(),
    settings?.approvalBoardColumn?.trim(),
  ].filter((columnName): columnName is string => !!columnName);
  const canResolveCandidateBoard =
    !demoMode &&
    !!client &&
    !!settings?.org &&
    !!settings?.project &&
    !!resolvedTeam;
  const {
    boardConfig: candidateBoardConfig,
    isLoading: isLoadingCandidateBoard,
    error: candidateBoardError,
  } = useCandidateBoardConfig(
    client,
    settings?.org ?? "",
    settings?.project ?? "",
    resolvedTeam,
    canResolveCandidateBoard,
    settings?.workItemTypes,
    preferredBoardColumnNames,
    settings?.candidateBoardColumn?.trim(),
  );
  const { workItems: adoWorkItems, isLoading, isSuccess, error, refetch, dataUpdatedAt } =
    useWorkItems(
      client,
      "",
      settings?.org ?? "",
      settings?.project ?? "",
      settings?.pollInterval ?? 30,
      settings?.areaPath,
      settings?.workItemTypes,
      settings?.sourceBoardColumn,
      candidateBoardConfig,
    );

  const { workItems: completedAdoItems, isSuccess: completedSuccess } =
    useCompletedWorkItems(
      client,
      "",
      settings?.org ?? "",
      settings?.project ?? "",
      settings?.pollInterval ?? 30,
      settings?.areaPath,
      settings?.workItemTypes,
      settings?.approvalBoardColumn,
      candidateBoardConfig,
    );
  const {
    workItems: reviewWorkItems,
    newWorkIds: reviewNewWorkIds,
    completedIds: reviewCompletedIds,
    isLoading: isLoadingReviewWorkItems,
    error: reviewWorkItemsError,
  } = useReviewWorkItems(
    client,
    settings?.org ?? "",
    settings?.project ?? "",
    settings?.pollInterval ?? 30,
    settings?.areaPath,
    settings?.workItemTypes,
  );
  const {
    workItems: githubReviewWorkItems,
    isLoading: isLoadingGithubReviewWorkItems,
    error: githubReviewWorkItemsError,
    refetch: refetchGithubReviewWorkItems,
  } = useGithubReviewWorkItems(
    settings?.githubUsername ?? "",
    settings?.githubRepository ?? "",
    settings?.pollInterval ?? 30,
  );

  const completeWorkItem = useCompleteWorkItem(client);
  const returnToCandidate = useReturnToCandidate(client);
  const startWork = useStartWork(client);
  const reviewPullRequest = useReviewPullRequest(client);
  const canLoadCandidates =
    canResolveCandidateBoard;
  const { candidates, isLoading: isLoadingCandidates } = useCandidates(
    client,
    "",
    settings?.org ?? "",
    settings?.project ?? "",
    canLoadCandidates,
    settings?.areaPath,
    settings?.workItemTypes,
    undefined,
    candidateBoardConfig,
  );

  const customWorkItems = useMemo(
    () => customTasksToWorkItems(customTasks, settings?.approvalBoardColumn),
    [customTasks, settings?.approvalBoardColumn],
  );

  const workItems = useMemo(
    () => [
      ...adoWorkItems,
      ...completedAdoItems,
      ...customWorkItems,
      ...reviewWorkItems,
      ...githubReviewWorkItems,
    ],
    [adoWorkItems, completedAdoItems, customWorkItems, reviewWorkItems, githubReviewWorkItems],
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
  const githubReviewPlacement = useMemo(
    () => getGithubReviewPlacement(githubReviewWorkItems, assignments),
    [assignments, githubReviewWorkItems],
  );
  const candidateIds = useMemo(
    () =>
      new Set([
        ...candidates.map((candidate) => candidate.id),
        ...reviewNewWorkIds,
        ...githubReviewPlacement.candidateIds,
      ]),
    [candidates, githubReviewPlacement, reviewNewWorkIds],
  );
  const completedIds = useMemo(
    () =>
      new Set([
        ...completedAdoItems.map((item) => item.id),
        ...reviewCompletedIds,
        ...githubReviewPlacement.completedIds,
      ]),
    [completedAdoItems, githubReviewPlacement, reviewCompletedIds],
  );
  const reconcileReady = isReconcileReady(
    isSuccess,
    completedSuccess,
    settings?.approvalBoardColumn,
  );

  useReconcile(
    boardWorkItems,
    assignments,
    columns,
    collections,
    reconcileReady && !isBoardDragging,
    undefined,
    undefined,
    undefined,
    candidateIds,
    completedIds,
  );

  const boardWorkItemMap = useMemo(
    () => new Map(boardWorkItems.map((workItem) => [workItem.id, workItem])),
    [boardWorkItems],
  );

  const getBoardTransition = useCallback(
    (workItemId: number, columnName: string | undefined): BoardTransition | null => {
      const workItem = boardWorkItemMap.get(workItemId);
      if (!candidateBoardConfig) {
        toast.error("Source board not configured", {
          description: "Add Team in Settings so Cerulean can resolve the source board.",
          id: `board-config-error-${workItemId}`,
        });
        return null;
      }

      if (!columnName) {
        toast.error("No target board column configured", {
          description: "Set the source-board column in Settings.",
          id: `board-column-error-${workItemId}`,
        });
        return null;
      }

      const targetState = getBoardColumnTargetState(
        candidateBoardConfig,
        columnName,
        workItem?.type,
      );
      if (!targetState) {
        toast.error("No board state mapping", {
          description: workItem?.type
            ? `${columnName} has no mapped source-board state for ${workItem.type}.`
            : `Unable to resolve the source-board state for ${columnName}.`,
          id: `board-state-error-${workItemId}-${columnName}`,
        });
        return null;
      }

      return {
        workItemId,
        targetState,
        ...getTargetBoardColumnUpdate(candidateBoardConfig, columnName),
      };
    },
    [boardWorkItemMap, candidateBoardConfig],
  );

  if (error) {
    toast.error("Failed to fetch work items", {
      description: error.message,
      id: "fetch-error",
    });
  }

  if (candidateBoardError) {
    toast.error("Failed to resolve source board", {
      description: candidateBoardError.message,
      id: "candidate-board-config-error",
    });
  }

  if (reviewWorkItemsError) {
    toast.error("Failed to fetch review pull requests", {
      description: reviewWorkItemsError.message,
      id: "review-fetch-error",
    });
  }

  if (githubReviewWorkItemsError) {
    toast.error("Failed to fetch GitHub review pull requests", {
      description: githubReviewWorkItemsError.message,
      id: "github-review-fetch-error",
    });
  }

  const boardData = useBoard(boardWorkItems);
  const hasSettings = !!(settings?.pat && settings?.org && settings?.project);
  const hasColumns = columns.length > 0;
  const showDemoButton = !!settings?.approvalBoardColumn && !!settings?.closedState && !!candidateBoardConfig;

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

    const boardWorkItem = boardWorkItemMap.get(workItemId);

    const movingToNewWork = toColumnId === NEW_WORK_COLUMN_ID;
    const movingFromNewWork = fromColumnId === NEW_WORK_COLUMN_ID;
    const movingToCompleted =
      toColumnId === COMPLETED_COLUMN_ID &&
      fromColumnId !== COMPLETED_COLUMN_ID;
    const movingFromCompleted =
      fromColumnId === COMPLETED_COLUMN_ID &&
      toColumnId !== COMPLETED_COLUMN_ID;

    if (isReviewWorkItem(boardWorkItem)) {
      if (boardWorkItem.review.provider === "github") {
        toast.error("GitHub review cards are read-only", {
          description: "Public GitHub review cards do not support board mutations yet.",
          id: `github-review-readonly-${boardWorkItem.id}`,
        });
        return;
      }

      const { repositoryId, pullRequestId } = boardWorkItem.review;

      if (movingToNewWork) {
        reviewPullRequest.mutate(
          {
            repositoryId,
            pullRequestId,
            action: "remove-reviewer",
          },
          {
            onError: (err) =>
              toast.error("Failed to unassign review", {
                description: err.message,
                id: `review-remove-error-${pullRequestId}`,
              }),
          },
        );
        return;
      }

      if (movingToCompleted) {
        reviewPullRequest.mutate(
          {
            repositoryId,
            pullRequestId,
            action: "approve-review",
          },
          {
            onError: (err) =>
              toast.error("Failed to approve pull request", {
                description: err.message,
                id: `review-approve-error-${pullRequestId}`,
              }),
          },
        );
        return;
      }

      if (movingFromNewWork) {
        reviewPullRequest.mutate(
          {
            repositoryId,
            pullRequestId,
            action: "start-review",
          },
          {
            onError: (err) =>
              toast.error("Failed to assign reviewer", {
                description: err.message,
                id: `review-start-error-${pullRequestId}`,
              }),
          },
        );
        return;
      }

      if (movingFromCompleted) {
        reviewPullRequest.mutate(
          {
            repositoryId,
            pullRequestId,
            action: "clear-vote",
          },
          {
            onError: (err) =>
              toast.error("Failed to reopen review", {
                description: err.message,
                id: `review-clear-error-${pullRequestId}`,
              }),
          },
        );
        return;
      }

      return;
    }

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

    if (movingToNewWork) {
      const transition = getBoardTransition(workItemId, candidateBoardConfig?.intakeColumnName);
      if (!transition) return;
      returnToCandidate.mutate(
        {
          workItemId,
          targetState: transition.targetState,
          targetBoardColumnField: transition.targetBoardColumnField,
          targetBoardColumnName: transition.targetBoardColumnName,
          targetBoardDoneField: transition.targetBoardDoneField,
        },
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

    if (movingToCompleted) {
      const transition = getBoardTransition(workItemId, settings?.approvalBoardColumn);
      if (!transition) return;
      completeWorkItem.mutate(
        transition,
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

    if (movingFromNewWork) {
      const transition = getBoardTransition(workItemId, settings?.sourceBoardColumn);
      if (!transition) return;
      startWork.mutate(
        {
          ...transition,
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

    if (movingFromCompleted) {
      const transition = getBoardTransition(workItemId, settings?.sourceBoardColumn);
      if (!transition) return;
      completeWorkItem.mutate(
        transition,
        {
          onError: (err) =>
            toast.error("Failed to update work item state", {
              description: err.message,
              id: `uncomplete-error-${workItemId}`,
            }),
        },
      );
      return;
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
          onRefresh={() => {
            void refetch();
            void refetchGithubReviewWorkItems();
          }}
          isRefreshing={isLoading || isLoadingReviewWorkItems || isLoadingGithubReviewWorkItems}
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
            approvalBoardColumn={settings.approvalBoardColumn}
            boardConfig={candidateBoardConfig}
            closedState={settings.closedState}
            org={settings.org}
            project={settings.project}
          />
        ) : (isLoading || isLoadingReviewWorkItems || isLoadingGithubReviewWorkItems) &&
          workItems.length === 0 ? (
          <BoardSkeleton columnCount={columns.length} />
        ) : (
          <Board
            data={boardData}
            isLoadingCandidates={isLoadingCandidates || isLoadingCandidateBoard}
            onAddTask={handleAddTask}
            onColumnChange={handleColumnChange}
            onDragStateChange={setIsBoardDragging}
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
