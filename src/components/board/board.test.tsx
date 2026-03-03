import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { Board } from "./board";
import { createWorkItem } from "@/test/fixtures/work-items";
import type { BoardData } from "@/hooks/use-board";
import type { ColumnAssignment } from "@/types/board";

function createBoardData(overrides: Partial<BoardData> = {}): BoardData {
  const columns = overrides.columns ?? [
    { id: "col-1", name: "To Do", order: 0 },
    { id: "col-2", name: "Doing", order: 1 },
  ];

  const w1 = createWorkItem({ id: 1, title: "First item" });
  const w2 = createWorkItem({ id: 2, title: "Second item" });

  const assignments: ColumnAssignment[] = overrides.assignments ?? [
    { id: "a1", workItemId: 1, columnId: "col-1", position: 0 },
    { id: "a2", workItemId: 2, columnId: "col-2", position: 0 },
  ];

  const columnItems = new Map([
    ["col-1", [{ assignment: assignments[0], workItem: w1 }]],
    ["col-2", [{ assignment: assignments[1], workItem: w2 }]],
  ]);

  return {
    columns,
    assignments,
    settings: null,
    columnItems,
    ...overrides,
  };
}

describe("Board", () => {
  it("renders columns with names", () => {
    renderWithProviders(<Board data={createBoardData()} />);

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("Doing")).toBeInTheDocument();
  });

  it("renders cards in correct columns", () => {
    renderWithProviders(<Board data={createBoardData()} />);

    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByText("Second item")).toBeInTheDocument();
  });

  it("shows item counts", () => {
    renderWithProviders(<Board data={createBoardData()} />);

    const counts = screen.getAllByText("1");
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });

  it("renders empty columns", () => {
    const data = createBoardData({
      columns: [{ id: "col-1", name: "Empty Col", order: 0 }],
      assignments: [],
      columnItems: new Map([["col-1", []]]),
    });

    renderWithProviders(<Board data={data} />);
    expect(screen.getByText("Empty Col")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
