import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { DEFAULT_SETTINGS } from "@/types/board";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  boardOnColumnChange: undefined as
    | ((workItemId: number, fromColumnId: string, toColumnId: string) => void)
    | undefined,
  startMutate: vi.fn(),
  returnMutate: vi.fn(),
  completeMutate: vi.fn(),
}));

vi.mock("@/components/board/board", () => ({
  Board: ({
    onColumnChange,
  }: {
    onColumnChange?: (workItemId: number, fromColumnId: string, toColumnId: string) => void;
  }) => {
    mocks.boardOnColumnChange = onColumnChange;
    return <div>Board</div>;
  },
}));

vi.mock("@/hooks/use-work-items", () => ({
  useWorkItems: () => ({
    workItems: [],
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

describe("App column change behavior", () => {
  beforeEach(() => {
    mocks.boardOnColumnChange = undefined;
    mocks.startMutate.mockReset();
    mocks.returnMutate.mockReset();
    mocks.completeMutate.mockReset();
  });

  it("starts work when dragging from New Work to another column", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      collections.settings.insert({
        ...DEFAULT_SETTINGS,
        id: "settings",
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
        sourceState: "Active",
        candidateState: "New",
      });
      collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    });

    await waitFor(() => expect(mocks.boardOnColumnChange).toBeTypeOf("function"));

    act(() => {
      mocks.boardOnColumnChange?.(101, NEW_WORK_COLUMN_ID, "col-1");
    });

    expect(mocks.startMutate).toHaveBeenCalledTimes(1);
    expect(mocks.startMutate).toHaveBeenCalledWith(
      {
        workItemId: 101,
        targetState: "Active",
        optimisticRemoveFromCandidates: false,
      },
      expect.objectContaining({
        onError: expect.any(Function),
      }),
    );
  });

  it("does not call remote mutations for custom task moved to New Work", async () => {
    const { collections } = renderWithProviders(<App />);

    act(() => {
      collections.settings.insert({
        ...DEFAULT_SETTINGS,
        id: "settings",
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
        sourceState: "Active",
        candidateState: "New",
        approvalState: "Resolved",
      });
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
      collections.settings.insert({
        ...DEFAULT_SETTINGS,
        id: "settings",
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
        sourceState: "Active",
        candidateState: "New",
        approvalState: "Resolved",
      });
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
      collections.settings.insert({
        ...DEFAULT_SETTINGS,
        id: "settings",
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
        sourceState: "Active",
        candidateState: "New",
        approvalState: "Resolved",
      });
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
      collections.settings.insert({
        ...DEFAULT_SETTINGS,
        id: "settings",
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
        sourceState: "Active",
        candidateState: "New",
        approvalState: "Resolved",
      });
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
});
