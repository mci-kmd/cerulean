import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { createWorkItem } from "@/test/fixtures/work-items";
import { NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import { NewWorkColumn } from "./new-work-column";

describe("NewWorkColumn", () => {
  it("renders New Work items with board card UI and no Start button", () => {
    const workItem = createWorkItem({ id: 10, title: "Candidate item", state: "New" });

    renderWithProviders(
      <NewWorkColumn
        boardItems={[
          {
            assignment: {
              id: "a-new-1",
              workItemId: 10,
              columnId: NEW_WORK_COLUMN_ID,
              position: 1,
            },
            workItem,
          },
        ]}
        isLoadingCandidates={false}
      />,
    );

    expect(screen.getByText("Candidate item")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });
});
