import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { createWorkItem } from "@/test/fixtures/work-items";
import { BoardColumnItems, type BoardColumnItem } from "./board-column-items";

function createUiReviewItem(
  assignmentId: string,
  workItemId: number,
  title: string,
  feature?: { id: number; title: string },
): BoardColumnItem {
  return {
    assignment: {
      id: assignmentId,
      workItemId,
      columnId: "active",
      position: workItemId,
    },
    workItem: createWorkItem({
      id: workItemId,
      title,
      kind: "ui-review",
      uiReview: {
        sourceWorkItemId: Math.abs(workItemId),
        reviewTag: "UI Review",
        parentFeature: feature,
      },
    }),
  };
}

describe("BoardColumnItems", () => {
  it("collapses UI review siblings into an expandable Feature stack", async () => {
    const user = userEvent.setup();
    const feature = { id: 100, title: "Authentication" };
    renderWithProviders(
      <BoardColumnItems
        columnId="active"
        items={[
          createUiReviewItem("a1", -1, "Review login", feature),
          createUiReviewItem("a2", -2, "Review logout", feature),
        ]}
      />,
    );

    const stack = screen.getByRole("button", {
      name: /Authentication\s*2 UI review items/i,
    });
    const children = document.getElementById("feature-active-100");

    expect(stack).toHaveAttribute("aria-expanded", "false");
    expect(children).toHaveStyle({ gridTemplateRows: "0fr" });

    await user.click(stack);

    expect(stack).toHaveAttribute("aria-expanded", "true");
    expect(children).toHaveStyle({ gridTemplateRows: "1fr" });
    expect(screen.getByText("Review login")).toBeInTheDocument();
    expect(screen.getByText("Review logout")).toBeInTheDocument();

    await user.click(stack);
    expect(stack).toHaveAttribute("aria-expanded", "false");
  });

  it("does not group a lone UI review item", () => {
    renderWithProviders(
      <BoardColumnItems
        columnId="active"
        items={[
          createUiReviewItem("a1", -1, "Review login", {
            id: 100,
            title: "Authentication",
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /Authentication/i })).not.toBeInTheDocument();
    expect(screen.getByText("Review login")).toBeInTheDocument();
  });

  it("groups only UI review items sharing the same Feature", () => {
    renderWithProviders(
      <BoardColumnItems
        columnId="active"
        items={[
          createUiReviewItem("a1", -1, "Review login", {
            id: 100,
            title: "Authentication",
          }),
          createUiReviewItem("a2", -2, "Review profile", {
            id: 200,
            title: "Profiles",
          }),
        ]}
      />,
    );

    expect(screen.queryByText("2 UI review items")).not.toBeInTheDocument();
    expect(screen.getByText("Review login")).toBeInTheDocument();
    expect(screen.getByText("Review profile")).toBeInTheDocument();
  });
});
