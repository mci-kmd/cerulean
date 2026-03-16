import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/helpers/render";
import { createWorkItem } from "@/test/fixtures/work-items";
import { BoardCard } from "./board-card";

const sortableMocks = vi.hoisted(() => ({
  useSortable: vi.fn(() => ({ ref: () => undefined, isDragSource: false })),
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: sortableMocks.useSortable,
}));

describe("BoardCard sortable config", () => {
  it("uses move feedback to avoid placeholder replace races", () => {
    renderWithProviders(
      <BoardCard
        workItem={createWorkItem({ id: 1, title: "Story" })}
        assignmentId="a-1"
        index={0}
        columnId="col-1"
      />,
    );

    expect(sortableMocks.useSortable).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a-1",
        index: 0,
        group: "col-1",
        feedback: "move",
      }),
    );
  });
});
