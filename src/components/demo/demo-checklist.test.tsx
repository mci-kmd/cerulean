import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { DemoChecklist } from "./demo-checklist";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `cl-${++i}`;
  })(),
}));

describe("DemoChecklist", () => {
  const user = userEvent.setup();

  it("adds a checklist item", async () => {
    renderWithProviders(<DemoChecklist workItemId={1} />);

    const input = screen.getByPlaceholderText("Add checklist item...");
    await user.type(input, "Demo login flow");
    await user.click(screen.getByLabelText("Add item"));

    await waitFor(() => {
      expect(screen.getByText("Demo login flow")).toBeInTheDocument();
    });
  });

  it("adds item on Enter key", async () => {
    renderWithProviders(<DemoChecklist workItemId={1} />);

    const input = screen.getByPlaceholderText("Add checklist item...");
    await user.type(input, "Press enter{enter}");

    await waitFor(() => {
      expect(screen.getByText("Press enter")).toBeInTheDocument();
    });
  });

  it("checks and unchecks an item", async () => {
    renderWithProviders(<DemoChecklist workItemId={1} />);

    const input = screen.getByPlaceholderText("Add checklist item...");
    await user.type(input, "Toggle me{enter}");

    await waitFor(() => {
      expect(screen.getByText("Toggle me")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Toggle me"));

    await waitFor(() => {
      expect(screen.getByText("Toggle me")).toHaveClass("line-through");
    });
  });

  it("removes a checklist item", async () => {
    renderWithProviders(<DemoChecklist workItemId={1} />);

    const input = screen.getByPlaceholderText("Add checklist item...");
    await user.type(input, "Remove me{enter}");

    await waitFor(() => {
      expect(screen.getByText("Remove me")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Remove Remove me"));

    await waitFor(() => {
      expect(screen.queryByText("Remove me")).not.toBeInTheDocument();
    });
  });
});
