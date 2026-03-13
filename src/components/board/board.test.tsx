import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { Board } from "./board";
import { scheduleColumnChange } from "./schedule-column-change";
import { createWorkItem } from "@/test/fixtures/work-items";
import { COMPLETED_COLUMN_ID } from "@/types/board";
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
  it("defers column change callbacks using drag-safe scheduling", () => {
    vi.useFakeTimers();
    try {
      const onColumnChange = vi.fn();

      scheduleColumnChange(onColumnChange, 1, "col-1", "col-2");
      expect(onColumnChange).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(onColumnChange).toHaveBeenCalledWith(1, "col-1", "col-2");
    } finally {
      vi.useRealTimers();
    }
  });

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
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
  });

  it("renders completed column with distinct styling", () => {
    const w1 = createWorkItem({ id: 3, title: "Done item", state: "Resolved" });
    const assignment: ColumnAssignment = {
      id: "a3",
      workItemId: 3,
      columnId: COMPLETED_COLUMN_ID,
      position: 0,
    };

    const data = createBoardData({
      columns: [
        { id: "col-1", name: "To Do", order: 0 },
        { id: COMPLETED_COLUMN_ID, name: "Completed", order: Infinity },
      ],
      assignments: [assignment],
      columnItems: new Map([
        ["col-1", []],
        [COMPLETED_COLUMN_ID, [{ assignment, workItem: w1 }]],
      ]),
    });

    renderWithProviders(<Board data={data} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Done item")).toBeInTheDocument();
  });

  it("shows add-task button only on New Work when enabled", async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn();

    renderWithProviders(<Board data={createBoardData()} onAddTask={onAddTask} />);

    const addButtons = screen.getAllByRole("button", { name: /add task to/i });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0]).toHaveAccessibleName("Add task to New Work");

    await user.click(addButtons[0]);
    expect(onAddTask).toHaveBeenCalledTimes(1);
  });
});
