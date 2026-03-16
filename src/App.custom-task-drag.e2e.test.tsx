import { act, waitFor } from "@testing-library/react";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/helpers/render";
import { DEFAULT_SETTINGS } from "@/types/board";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import { App } from "./App";

type MockDragEvent = {
  canceled: boolean;
  operation: { source: unknown; target: unknown };
};

type MockDragManager = {
  renderer: { rendering: Promise<unknown> };
};

const dndMocks: {
  onDragEnd: ((event: MockDragEvent) => void) | null;
  renderingPromise: Promise<unknown>;
} = vi.hoisted(() => ({
  onDragEnd: null,
  renderingPromise: Promise.resolve(),
}));

vi.mock("@dnd-kit/react", async () => {
  const React = await import("react");
  return {
    DragDropProvider: ({
      onDragEnd,
      children,
    }: {
      onDragEnd: (event: MockDragEvent, manager?: MockDragManager) => void;
      children: React.ReactNode;
    }) => {
      dndMocks.onDragEnd = (event) => {
        onDragEnd(event, { renderer: { rendering: dndMocks.renderingPromise } });
      };
      return React.createElement(React.Fragment, null, children);
    },
    useDroppable: () => ({ ref: () => undefined }),
    DragOverlay: ({
      children,
    }: {
      children: React.ReactNode | ((source: { id: string }) => React.ReactNode);
    }) =>
      React.createElement(
        React.Fragment,
        null,
        typeof children === "function" ? children({ id: "__overlay-source__" }) : children,
      ),
  };
});

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => undefined, isDragSource: false }),
  isSortableOperation: (operation: MockDragEvent["operation"]) =>
    Boolean(
      operation.source &&
        operation.target &&
        typeof operation.target === "object" &&
        operation.target !== null &&
        "index" in operation.target &&
        typeof operation.target.index === "number",
    ),
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

describe("App custom-task drag E2E", () => {
  beforeEach(() => {
    dndMocks.onDragEnd = null;
    dndMocks.renderingPromise = Promise.resolve();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves custom task across columns without flushSync lifecycle crash", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
      collections.columns.insert({ id: "col-2", name: "Doing", order: 1 });
      collections.customTasks.insert({
        id: "ct-1",
        workItemId: -1001,
        title: "E2E Custom Task",
      });
      collections.assignments.insert({
        id: "a-custom-1",
        workItemId: -1001,
        columnId: NEW_WORK_COLUMN_ID,
        position: 1,
      });
    });

    await waitFor(() => expect(dndMocks.onDragEnd).toBeTypeOf("function"));

    const drag = (targetColumnId: string) => {
      act(() => {
        dndMocks.onDragEnd?.({
          canceled: false,
          operation: {
            source: { id: "a-custom-1" },
            target: { id: targetColumnId, group: targetColumnId, index: 0 },
          },
        });
      });
    };

    drag("col-1");
    await waitFor(() => {
      expect(collections.assignments.get("a-custom-1")?.columnId).toBe("col-1");
    });

    drag("col-2");
    await waitFor(() => {
      expect(collections.assignments.get("a-custom-1")?.columnId).toBe("col-2");
    });

    drag(NEW_WORK_COLUMN_ID);
    await waitFor(() => {
      expect(collections.assignments.get("a-custom-1")?.columnId).toBe(NEW_WORK_COLUMN_ID);
    });

    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("flushSync was called from inside a lifecycle method"),
        ),
      ),
    ).toBe(false);
  });

  it("moves custom task through completed column without flushSync lifecycle crash", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
        workItemId: -1002,
        title: "Completed flow task",
      });
      collections.assignments.insert({
        id: "a-custom-2",
        workItemId: -1002,
        columnId: NEW_WORK_COLUMN_ID,
        position: 1,
      });
    });

    await waitFor(() => expect(dndMocks.onDragEnd).toBeTypeOf("function"));

    const drag = (targetColumnId: string) => {
      act(() => {
        dndMocks.onDragEnd?.({
          canceled: false,
          operation: {
            source: { id: "a-custom-2" },
            target: { id: targetColumnId, group: targetColumnId, index: 0 },
          },
        });
      });
    };

    drag(COMPLETED_COLUMN_ID);
    await waitFor(() => {
      expect(collections.assignments.get("a-custom-2")?.columnId).toBe(COMPLETED_COLUMN_ID);
    });
    await waitFor(() => {
      expect(collections.customTasks.get("ct-2")?.completedAt).toBeTypeOf("number");
    });

    drag("col-1");
    await waitFor(() => {
      expect(collections.assignments.get("a-custom-2")?.columnId).toBe("col-1");
    });
    await waitFor(() => {
      expect(collections.customTasks.get("ct-2")?.completedAt).toBeUndefined();
    });

    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("flushSync was called from inside a lifecycle method"),
        ),
      ),
    ).toBe(false);
  });

  it("avoids flushSync lifecycle error while dnd renderer is still settling", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
      collections.columns.insert({ id: "col-2", name: "Doing", order: 1 });
      collections.customTasks.insert({
        id: "ct-3",
        workItemId: -1003,
        title: "Timing-sensitive task",
      });
      collections.assignments.insert({
        id: "a-custom-3",
        workItemId: -1003,
        columnId: NEW_WORK_COLUMN_ID,
        position: 1,
      });
    });

    await waitFor(() => expect(dndMocks.onDragEnd).toBeTypeOf("function"));
    vi.useFakeTimers();
    let resolveRendering!: () => void;
    dndMocks.renderingPromise = new Promise<void>((resolve) => {
      resolveRendering = resolve;
    });
    let renderingActive = true;
    const updateReal = collections.assignments.update.bind(collections.assignments);
    vi.spyOn(collections.assignments, "update").mockImplementation((...args) => {
      if (renderingActive) {
        flushSync(() => {});
      }
      return updateReal(...(args as Parameters<typeof updateReal>));
    });

    act(() => {
      dndMocks.onDragEnd?.({
        canceled: false,
        operation: {
          source: { id: "a-custom-3" },
          target: { id: "col-1", group: "col-1", index: 0 },
        },
      });
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(collections.assignments.get("a-custom-3")?.columnId).toBe(NEW_WORK_COLUMN_ID);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("flushSync was called from inside a lifecycle method"),
        ),
      ),
    ).toBe(false);
    expect(collections.assignments.get("a-custom-3")?.columnId).toBe(NEW_WORK_COLUMN_ID);

    renderingActive = false;
    resolveRendering();
    await Promise.resolve();
    await Promise.resolve();
    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(collections.assignments.get("a-custom-3")?.columnId).toBe("col-1");

    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("flushSync was called from inside a lifecycle method"),
        ),
      ),
    ).toBe(false);
  });

  it("defers custom-task completion mutation until after renderer settle window", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
        id: "ct-4",
        workItemId: -1004,
        title: "Completion timing task",
      });
      collections.assignments.insert({
        id: "a-custom-4",
        workItemId: -1004,
        columnId: NEW_WORK_COLUMN_ID,
        position: 1,
      });
    });

    await waitFor(() => expect(dndMocks.onDragEnd).toBeTypeOf("function"));
    vi.useFakeTimers();
    let resolveRendering!: () => void;
    dndMocks.renderingPromise = new Promise<void>((resolve) => {
      resolveRendering = resolve;
    });
    let renderingActive = true;
    const updateReal = collections.customTasks.update.bind(collections.customTasks);
    vi.spyOn(collections.customTasks, "update").mockImplementation((...args) => {
      if (renderingActive) {
        flushSync(() => {});
      }
      return updateReal(...(args as Parameters<typeof updateReal>));
    });

    act(() => {
      dndMocks.onDragEnd?.({
        canceled: false,
        operation: {
          source: { id: "a-custom-4" },
          target: { id: COMPLETED_COLUMN_ID, group: COMPLETED_COLUMN_ID, index: 0 },
        },
      });
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(collections.customTasks.get("ct-4")?.completedAt).toBeUndefined();

    resolveRendering();
    await Promise.resolve();
    await Promise.resolve();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(collections.customTasks.get("ct-4")?.completedAt).toBeUndefined();
    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("flushSync was called from inside a lifecycle method"),
        ),
      ),
    ).toBe(false);

    renderingActive = false;
    await Promise.resolve();
    await Promise.resolve();
    act(() => {
      vi.runAllTimers();
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(collections.assignments.get("a-custom-4")?.columnId).toBe(COMPLETED_COLUMN_ID);
    vi.useRealTimers();
    await waitFor(() => {
      expect(collections.customTasks.get("ct-4")?.completedAt).toBeTypeOf("number");
    });
    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("flushSync was called from inside a lifecycle method"),
        ),
      ),
    ).toBe(false);
  });
});
