import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderWithProviders, createTestCollections } from "@/test/helpers/render";
import { createWorkItem } from "@/test/fixtures/work-items";
import { Board } from "./board";
import type { BoardData } from "@/hooks/use-board";
import type { ColumnAssignment } from "@/types/board";

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
    dragMocks.onDragEnd = null;
  });

  it("defers assignment update when moving last card to another column", async () => {
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
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
