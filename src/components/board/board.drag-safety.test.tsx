import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, screen, within } from "@testing-library/react";
import { renderWithProviders, createTestCollections } from "@/test/helpers/render";
import { createWorkItem } from "@/test/fixtures/work-items";
import { Board } from "./board";
import type { BoardData } from "@/hooks/use-board";
import type { ColumnAssignment } from "@/types/board";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";

type MockDragEvent = {
  canceled: boolean;
  operation: { source: unknown; target: unknown };
};

const dragMocks: {
  onDragStart: ((event: MockDragEvent) => void) | null;
  onDragEnd: ((event: MockDragEvent) => void) | null;
  overlaySourceId: string | null;
} =
  vi.hoisted(() => ({
    onDragStart: null,
    onDragEnd: null,
    overlaySourceId: null,
  }));

vi.mock("@dnd-kit/react", async () => {
  const React = await import("react");
  return {
    DragDropProvider: ({
      onDragStart,
      onDragEnd,
      children,
    }: {
      onDragStart?: (event: MockDragEvent) => void;
      onDragEnd: (event: MockDragEvent) => void;
      children: ReactNode;
    }) => {
      dragMocks.onDragStart = onDragStart ?? null;
      dragMocks.onDragEnd = onDragEnd;
      return React.createElement(React.Fragment, null, children);
    },
    useDroppable: () => ({ ref: () => undefined }),
    DragOverlay: ({
      children,
    }: {
      children: ReactNode | ((source: { id: string }) => ReactNode);
    }) =>
      React.createElement(
        React.Fragment,
        null,
        typeof children === "function"
          ? children({ id: dragMocks.overlaySourceId ?? "__overlay-source__" })
          : children,
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

function createData(): { data: BoardData; assignment: ColumnAssignment } {
  const assignment: ColumnAssignment = {
    id: "a-last",
    workItemId: 101,
    columnId: "col-1",
    position: 0,
  };
  const workItem = createWorkItem({ id: 101, title: "Last in first column" });

  const data: BoardData = {
    columns: [
      { id: "col-1", name: "First", order: 0 },
      { id: "col-2", name: "Second", order: 1 },
    ],
    assignments: [assignment],
    settings: null,
    columnItems: new Map([
      ["col-1", [{ assignment, workItem }]],
      ["col-2", []],
    ]),
  };

  return { data, assignment };
}

describe("Board drag safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dragMocks.onDragStart = null;
    dragMocks.onDragEnd = null;
    dragMocks.overlaySourceId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers assignment update when moving last card to another column", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);
    const updateSpy = vi.spyOn(collections.assignments, "update");

    renderWithProviders(<Board data={data} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    act(() => {
      dragMocks.onDragEnd?.({
        canceled: false,
        operation: {
          source: { id: assignment.id },
          target: { id: "col-2", group: "col-2", index: 0 },
        },
      });
    });

    expect(updateSpy).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not crash when assignment is removed before deferred update", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);
    const updateSpy = vi.spyOn(collections.assignments, "update");

    renderWithProviders(<Board data={data} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    dragMocks.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: assignment.id },
        target: { id: "col-2", group: "col-2", index: 0 },
      },
    });

    collections.assignments.delete([assignment.id]);
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("does not invoke column change when assignment no longer exists at flush time", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);
    const onColumnChange = vi.fn();

    renderWithProviders(<Board data={data} onColumnChange={onColumnChange} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    dragMocks.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: assignment.id },
        target: { id: NEW_WORK_COLUMN_ID },
      },
    });

    collections.assignments.delete([assignment.id]);
    vi.runAllTimers();
    expect(onColumnChange).not.toHaveBeenCalled();
  });

  it("allows dropping into empty completed column", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);

    const dataWithCompleted: BoardData = {
      ...data,
      columns: [
        ...data.columns,
        { id: COMPLETED_COLUMN_ID, name: "Completed", order: Number.POSITIVE_INFINITY },
      ],
      columnItems: new Map([
        ...data.columnItems,
        [COMPLETED_COLUMN_ID, []],
      ]),
    };

    renderWithProviders(<Board data={dataWithCompleted} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    dragMocks.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: assignment.id },
        target: { id: COMPLETED_COLUMN_ID },
      },
    });

    expect(collections.assignments.get(assignment.id)?.columnId).toBe("col-1");
    vi.runAllTimers();
    expect(collections.assignments.get(assignment.id)?.columnId).toBe(COMPLETED_COLUMN_ID);
  });

  it("allows dropping into New Work column", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);

    renderWithProviders(<Board data={data} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    dragMocks.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: assignment.id },
        target: { id: NEW_WORK_COLUMN_ID },
      },
    });

    expect(collections.assignments.get(assignment.id)?.columnId).toBe("col-1");
    vi.runAllTimers();
    expect(collections.assignments.get(assignment.id)?.columnId).toBe(NEW_WORK_COLUMN_ID);
  });

  it("renders dropped card in destination column before deferred mutation flush", async () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);

    const { container } = renderWithProviders(<Board data={data} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    await act(async () => {
      dragMocks.onDragEnd?.({
        canceled: false,
        operation: {
          source: { id: assignment.id },
          target: { id: "col-2", group: "col-2", index: 0 },
        },
      });
    });

    const firstColumn = container.querySelector('[data-column-id="col-1"]');
    const secondColumn = container.querySelector('[data-column-id="col-2"]');
    expect(firstColumn).not.toBeNull();
    expect(secondColumn).not.toBeNull();
    expect(collections.assignments.get(assignment.id)?.columnId).toBe("col-1");
    expect(within(secondColumn as HTMLElement).getByText("Last in first column")).toBeInTheDocument();
  });

  it("does not crash when sortable drop index is negative", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);

    renderWithProviders(<Board data={data} />, { collections });
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    expect(() => {
      dragMocks.onDragEnd?.({
        canceled: false,
        operation: {
          source: { id: assignment.id },
          target: { id: "col-2", group: "col-2", index: -1 },
        },
      });
      vi.runAllTimers();
    }).not.toThrow();

    expect(collections.assignments.get(assignment.id)?.columnId).toBe("col-2");
  });

  it("emits drag state start and settled end callbacks", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);
    const onDragStateChange = vi.fn();

    renderWithProviders(<Board data={data} onDragStateChange={onDragStateChange} />, {
      collections,
    });
    expect(dragMocks.onDragStart).toBeTypeOf("function");
    expect(dragMocks.onDragEnd).toBeTypeOf("function");

    dragMocks.onDragStart?.({
      canceled: false,
      operation: { source: { id: assignment.id }, target: { id: "col-1" } },
    });
    dragMocks.onDragEnd?.({
      canceled: true,
      operation: { source: { id: assignment.id }, target: { id: "col-1" } },
    });

    expect(onDragStateChange).toHaveBeenNthCalledWith(1, true);
    expect(onDragStateChange).toHaveBeenLastCalledWith(false);
  });

  it("renders drag overlay preview for source item", () => {
    const collections = createTestCollections();
    const { data, assignment } = createData();
    collections.assignments.insert(assignment);
    dragMocks.overlaySourceId = assignment.id;

    renderWithProviders(<Board data={data} />, { collections });

    expect(screen.getAllByText("Last in first column")).toHaveLength(2);
  });
});
