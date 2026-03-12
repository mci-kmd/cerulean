import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
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

const dragMocks: { onDragEnd: ((event: MockDragEvent) => void) | null } =
  vi.hoisted(() => ({
    onDragEnd: null,
  }));

vi.mock("@dnd-kit/react", async () => {
  const React = await import("react");
  return {
    DragDropProvider: ({
      onDragEnd,
      children,
    }: {
      onDragEnd: (event: MockDragEvent) => void;
      children: ReactNode;
    }) => {
      dragMocks.onDragEnd = onDragEnd;
      return React.createElement(React.Fragment, null, children);
    },
    useDroppable: () => ({ ref: () => undefined }),
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
    dragMocks.onDragEnd = null;
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

    dragMocks.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: assignment.id },
        target: { id: "col-2", group: "col-2", index: 0 },
      },
    });

    expect(updateSpy).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(updateSpy).toHaveBeenCalledTimes(1);
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
});
