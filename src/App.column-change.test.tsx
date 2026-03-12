import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { DEFAULT_SETTINGS } from "@/types/board";
import { NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  boardOnColumnChange: undefined as
    | ((workItemId: number, fromColumnId: string, toColumnId: string) => void)
    | undefined,
  startMutate: vi.fn(),
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

describe("App column change behavior", () => {
  beforeEach(() => {
    mocks.boardOnColumnChange = undefined;
    mocks.startMutate.mockReset();
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
});
