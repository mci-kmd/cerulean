import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { DemoItem } from "./demo-item";
import type { DemoWorkItem } from "@/types/demo";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `di-${++i}`;
  })(),
}));

const mockItem: DemoWorkItem = {
  id: 42,
  title: "Add login page",
  type: "User Story",
  state: "Resolved",
  url: "https://dev.azure.com/org/proj/_workitems/edit/42",
  description: "<p>Login page description</p>",
  acceptanceCriteria: "<p>Must have username field</p>",
};

describe("DemoItem", () => {
  const user = userEvent.setup();
  const defaultProps = {
    item: mockItem,
    isActive: false,
    isApproved: false,
    onSelect: vi.fn(),
    onApprove: vi.fn(),
    onUnapprove: vi.fn(),
  };

  it("renders collapsed state with id, title, and drag handle", () => {
    renderWithProviders(<DemoItem {...defaultProps} />);

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Add login page")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag to reorder")).toBeInTheDocument();
    // Content section should be collapsed (grid-template-rows: 0fr)
    const descButton = screen.getByRole("button", { name: /description/i });
    expect(descButton.closest(".overflow-hidden")!.parentElement).toHaveStyle({
      gridTemplateRows: "0fr",
    });
  });

  it("calls onSelect when collapsed card is clicked", async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DemoItem {...defaultProps} onSelect={onSelect} />,
    );

    await user.click(screen.getByText("Add login page"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders expanded state with description collapsed and acceptance criteria open", async () => {
    renderWithProviders(
      <DemoItem {...defaultProps} isActive={true} />,
    );

    const descBtn = screen.getByRole("button", { name: /description/i });
    const acBtn = screen.getByRole("button", { name: /acceptance criteria/i });

    // Description collapsed by default, acceptance criteria open
    expect(descBtn).toHaveAttribute("aria-expanded", "false");
    expect(acBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Must have username field")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();

    // Clicking opens description
    await user.click(descBtn);
    expect(descBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Login page description")).toBeInTheDocument();
  });

  it("collapses section content when toggled closed", async () => {
    renderWithProviders(
      <DemoItem {...defaultProps} isActive={true} />,
    );

    const descBtn = screen.getByRole("button", { name: /description/i });
    await user.click(descBtn); // open
    expect(descBtn).toHaveAttribute("aria-expanded", "true");
    await user.click(descBtn); // close
    expect(descBtn).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onApprove when approve button is clicked", async () => {
    const onApprove = vi.fn();
    renderWithProviders(
      <DemoItem {...defaultProps} isActive={true} onApprove={onApprove} />,
    );

    await user.click(screen.getByText("Approve"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("renders approved minimized state", () => {
    renderWithProviders(
      <DemoItem {...defaultProps} isApproved={true} />,
    );

    expect(
      screen.getByLabelText("Approved: Add login page"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add login page")).toHaveClass("line-through");
  });

  it("shows unapprove button when approved and active", async () => {
    const onUnapprove = vi.fn();
    renderWithProviders(
      <DemoItem
        {...defaultProps}
        isApproved={true}
        isActive={true}
        onUnapprove={onUnapprove}
      />,
    );

    expect(screen.getByText("Unapprove")).toBeInTheDocument();
    await user.click(screen.getByText("Unapprove"));
    expect(onUnapprove).toHaveBeenCalledTimes(1);
  });
});
