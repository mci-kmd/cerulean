import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "@/types/board";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import { renderWithProviders } from "@/test/helpers/render";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  boardOnColumnChange: undefined as
    | ((workItemId: number, fromColumnId: string, toColumnId: string) => void)
    | undefined,
  boardOnDragStateChange: undefined as ((isDragging: boolean) => void) | undefined,
  startMutate: vi.fn(),
  returnMutate: vi.fn(),
  completeMutate: vi.fn(),
  reviewMutate: vi.fn(),
  candidateBoardConfig: undefined as
    | {
        boardId: string;
        boardName: string;
        team: string;
        intakeColumnName: string;
        intakeColumnIsSplit: boolean;
        columnFieldReferenceName: string;
        doneFieldReferenceName?: string;
        intakeStateMappings: Record<string, string>;
        boardColumnsByName?: Record<
          string,
          { isSplit: boolean; stateMappings?: Record<string, string> }
        >;
      }
    | undefined,
  workItems: [] as Array<{
    id: number;
    title: string;
    type: string;
    state: string;
    rev: number;
    url: string;
    boardColumnName?: string;
  }>,
  reviewWorkItems: [] as Array<{
    id: number;
    displayId?: number;
    title: string;
    type: string;
    state: string;
    rev: number;
    url: string;
    kind?: "review";
    review?: {
      repositoryId: string;
      pullRequestId: number;
      reviewState: "new" | "active" | "completed";
    };
    relatedPullRequests?: Array<{
      id: string;
      label: string;
      title?: string;
      status?: string;
      url: string;
    }>;
  }>,
}));

vi.mock("@/components/board/board", () => ({
  Board: ({
    onColumnChange,
    onDragStateChange,
  }: {
    onColumnChange?: (workItemId: number, fromColumnId: string, toColumnId: string) => void;
    onDragStateChange?: (isDragging: boolean) => void;
  }) => {
    mocks.boardOnColumnChange = onColumnChange;
    mocks.boardOnDragStateChange = onDragStateChange;
    return <div>Board</div>;
  },
}));

vi.mock("@/hooks/use-work-items", () => ({
  useWorkItems: () => ({
    workItems: mocks.workItems,
    isLoading: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
  }),
}));

vi.mock("@/hooks/use-completed-work-items", () => ({
  useCompletedWorkItems: () => ({
    workItems: [],
    isSuccess: true,
  }),
}));

vi.mock("@/hooks/use-candidates", () => ({
  useCandidates: () => ({
    candidates: [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-candidate-board-config", () => ({
  useCandidateBoardConfig: () => ({
    boardConfig: mocks.candidateBoardConfig,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-review-work-items", () => ({
  useReviewWorkItems: () => ({
    workItems: mocks.reviewWorkItems,
    newWorkIds: new Set(
      mocks.reviewWorkItems
        .filter((item) => item.review?.reviewState === "new")
        .map((item) => item.id),
    ),
    completedIds: new Set(
      mocks.reviewWorkItems
        .filter((item) => item.review?.reviewState === "completed")
        .map((item) => item.id),
    ),
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-review-pull-request", () => ({
  useReviewPullRequest: () => ({
    mutate: mocks.reviewMutate,
  }),
}));

vi.mock("@/hooks/use-start-work", () => ({
  useStartWork: () => ({
    mutate: mocks.startMutate,
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("@/hooks/use-return-to-candidate", () => ({
  useReturnToCandidate: () => ({
    mutate: mocks.returnMutate,
  }),
}));

vi.mock("@/hooks/use-complete-work-item", () => ({
  useCompleteWorkItem: () => ({
    mutate: mocks.completeMutate,
  }),
}));

function createBoardConfig(overrides?: Partial<NonNullable<typeof mocks.candidateBoardConfig>>) {
  return {
    team: "My Team",
    boardId: "board-1",
    boardName: "Stories",
    intakeColumnName: "Incoming",
    intakeColumnIsSplit: false,
    columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
    intakeStateMappings: {
      Bug: "New",
      "User Story": "New",
    },
    boardColumnsByName: {
      incoming: { isSplit: false, stateMappings: { Bug: "New", "User Story": "New" } },
      committed: { isSplit: false, stateMappings: { Bug: "Active", "User Story": "Committed" } },
      approved: { isSplit: false, stateMappings: { Bug: "Resolved", "User Story": "Resolved" } },
    },
    ...overrides,
  };
}

function createWorkItem(id = 101) {
  return {
    id,
    title: "Fix login bug",
    type: "Bug",
    state: "Active",
    rev: 1,
    url: `https://dev.azure.com/test/_workitems/edit/${id}`,
    boardColumnName: "To Do",
  };
}

function createReviewWorkItem(
  id = -501,
  reviewState: "new" | "active" | "completed" = "new",
) {
  return {
    id,
    displayId: 101,
    title: "Review login fix",
    type: "Bug",
    state: "Active",
    rev: 1,
    url: "https://dev.azure.com/test/_workitems/edit/101",
    kind: "review" as const,
    review: {
      repositoryId: "repo-1",
      pullRequestId: 7001,
      reviewState,
    },
    relatedPullRequests: [
      {
        id: "7001",
        label: "PR #7001",
        title: "Review login fix",
        status: "active",
        url: "https://dev.azure.com/test/_git/repo-1/pullrequest/7001",
      },
    ],
  };
}

function insertSettings(
  collections: ReturnType<typeof renderWithProviders>["collections"],
  overrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  collections.settings.insert({
    ...DEFAULT_SETTINGS,
    id: "settings",
    pat: "test-pat",
      org: "test-org",
      project: "test-project",
      team: "My Team",
      sourceBoardColumn: "Committed",
      approvalBoardColumn: "Approved",
      closedState: "Closed",
      ...overrides,
  });
}

describe("App column change behavior", () => {
  beforeEach(() => {
    mocks.boardOnColumnChange = undefined;
    mocks.boardOnDragStateChange = undefined;
    mocks.startMutate.mockReset();
    mocks.returnMutate.mockReset();
    mocks.completeMutate.mockReset();
    mocks.reviewMutate.mockReset();
    mocks.candidateBoardConfig = createBoardConfig();
    mocks.workItems = [createWorkItem()];
    mocks.reviewWorkItems = [];
  });

  it("starts work when dragging from New Work into the configured source board column", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, NEW_WORK_COLUMN_ID, "col-1");
    });

    expect(mocks.startMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "Active",
        targetBoardColumnField: "WEF_FAKE_Kanban.Column",
        targetBoardColumnName: "Committed",
        optimisticRemoveFromCandidates: false,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("returns work to the source board incoming column", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, "col-1", NEW_WORK_COLUMN_ID);
    });

    expect(mocks.returnMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "New",
        targetBoardColumnField: "WEF_FAKE_Kanban.Column",
        targetBoardColumnName: "Incoming",
        targetBoardDoneField: undefined,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("returns work to the configured new-work board column", async () => {
    mocks.candidateBoardConfig = createBoardConfig({
      intakeColumnName: "Ideas",
      intakeStateMappings: {
        Bug: "Proposed",
        "User Story": "Idea",
      },
      boardColumnsByName: {
        ideas: {
          isSplit: false,
          stateMappings: { Bug: "Proposed", "User Story": "Idea" },
        },
        committed: { isSplit: false, stateMappings: { Bug: "Active", "User Story": "Committed" } },
        approved: { isSplit: false, stateMappings: { Bug: "Resolved", "User Story": "Resolved" } },
      },
    });
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, "col-1", NEW_WORK_COLUMN_ID);
    });

    expect(mocks.returnMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "Proposed",
        targetBoardColumnField: "WEF_FAKE_Kanban.Column",
        targetBoardColumnName: "Ideas",
        targetBoardDoneField: undefined,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("starts work into the active side of a split source board column", async () => {
    mocks.candidateBoardConfig = createBoardConfig({
      doneFieldReferenceName: "WEF_FAKE_Kanban.Column.Done",
      boardColumnsByName: {
        incoming: { isSplit: false, stateMappings: { Bug: "New" } },
        committed: { isSplit: true, stateMappings: { Bug: "Active" } },
        approved: { isSplit: false, stateMappings: { Bug: "Resolved" } },
      },
    });
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, NEW_WORK_COLUMN_ID, "col-1");
    });

    expect(mocks.startMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "Active",
        targetBoardColumnField: "WEF_FAKE_Kanban.Column",
        targetBoardColumnName: "Committed",
        targetBoardDoneField: "WEF_FAKE_Kanban.Column.Done",
        targetBoardDoneValue: false,
        optimisticRemoveFromCandidates: false,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("moves work into the configured approval board column", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, "col-1", COMPLETED_COLUMN_ID);
    });

    expect(mocks.completeMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "Resolved",
        targetBoardColumnField: "WEF_FAKE_Kanban.Column",
        targetBoardColumnName: "Approved",
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("moves work back from Completed into the configured source board column", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, COMPLETED_COLUMN_ID, "col-1");
    });

    expect(mocks.completeMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "Active",
        targetBoardColumnField: "WEF_FAKE_Kanban.Column",
        targetBoardColumnName: "Committed",
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("does not call remote mutations for moves between local columns", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
      collections.columns.insert({ id: "col-2", name: "Validating", order: 1 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, "col-1", "col-2");
    });

    expect(mocks.startMutate).not.toHaveBeenCalled();
    expect(mocks.returnMutate).not.toHaveBeenCalled();
    expect(mocks.completeMutate).not.toHaveBeenCalled();
  });

  it("does not call remote mutations for custom task moved to New Work", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "In Progress", order: 0 });
      collections.customTasks.insert({
        id: "ct-1",
        workItemId: -101,
        title: "Custom Task",
      });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    expect(() => {
      act(() => {
        mocks.boardOnColumnChange?.(-101, "col-1", NEW_WORK_COLUMN_ID);
      });
    }).not.toThrow();
    expect(mocks.startMutate).not.toHaveBeenCalled();
    expect(mocks.returnMutate).not.toHaveBeenCalled();
    expect(mocks.completeMutate).not.toHaveBeenCalled();
  });

  it("clears custom task completion when moving from Completed to New Work", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "In Progress", order: 0 });
      collections.customTasks.insert({
        id: "ct-2",
        workItemId: -102,
        title: "Custom Completed",
        completedAt: Date.now(),
      });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(-102, COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID);
    });

    await waitFor(() => {
      expect(collections.customTasks.get("ct-2")?.completedAt).toBeUndefined();
    });
    expect(mocks.startMutate).not.toHaveBeenCalled();
    expect(mocks.returnMutate).not.toHaveBeenCalled();
    expect(mocks.completeMutate).not.toHaveBeenCalled();
  });

  it("treats legacy positive-id custom tasks as custom and avoids remote mutations", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "In Progress", order: 0 });
      collections.customTasks.insert({
        id: "ct-legacy",
        workItemId: 4242,
        title: "Legacy Custom Task",
      });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    expect(() => {
      act(() => {
        mocks.boardOnColumnChange?.(4242, NEW_WORK_COLUMN_ID, "col-1");
      });
    }).not.toThrow();
    expect(mocks.startMutate).not.toHaveBeenCalled();
    expect(mocks.returnMutate).not.toHaveBeenCalled();
    expect(mocks.completeMutate).not.toHaveBeenCalled();
  });

  it("does not crash for orphan negative custom assignment move", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "In Progress", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    expect(() => {
      act(() => {
        mocks.boardOnColumnChange?.(-9999, NEW_WORK_COLUMN_ID, "col-1");
      });
    }).not.toThrow();
    expect(mocks.startMutate).not.toHaveBeenCalled();
    expect(mocks.returnMutate).not.toHaveBeenCalled();
    expect(mocks.completeMutate).not.toHaveBeenCalled();
  });

  it("wires drag-state callback into Board", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnDragStateChange).toBeTypeOf("function"));
  });

  it("assigns me as reviewer when dragging review work from New Work into an active column", async () => {
    mocks.workItems = [];
    mocks.reviewWorkItems = [createReviewWorkItem(-501, "new")];
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(-501, NEW_WORK_COLUMN_ID, "col-1");
    });

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      {
        repositoryId: "repo-1",
        pullRequestId: 7001,
        action: "start-review",
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("approves review work when dragging it into Completed", async () => {
    mocks.workItems = [];
    mocks.reviewWorkItems = [createReviewWorkItem(-502, "active")];
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(-502, "col-1", COMPLETED_COLUMN_ID);
    });

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      {
        repositoryId: "repo-1",
        pullRequestId: 7001,
        action: "approve-review",
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("clears review vote when moving review work back from Completed", async () => {
    mocks.workItems = [];
    mocks.reviewWorkItems = [createReviewWorkItem(-503, "completed")];
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(-503, COMPLETED_COLUMN_ID, "col-1");
    });

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      {
        repositoryId: "repo-1",
        pullRequestId: 7001,
        action: "clear-vote",
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("removes me as reviewer when moving review work back to New Work", async () => {
    mocks.workItems = [];
    mocks.reviewWorkItems = [createReviewWorkItem(-504, "active")];
    const { collections } = renderWithProviders(<App />);

    act(() => {
      insertSettings(collections);
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(-504, "col-1", NEW_WORK_COLUMN_ID);
    });

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      {
        repositoryId: "repo-1",
        pullRequestId: 7001,
        action: "remove-reviewer",
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });
});
