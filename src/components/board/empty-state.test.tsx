import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("shows configure message when no settings", () => {
    render(
      <EmptyState
        hasSettings={false}
        hasColumns={false}
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.getByText("Configure Connection")).toBeInTheDocument();
  });

  it("shows columns message when settings exist but no columns", () => {
    render(
      <EmptyState
        hasSettings={true}
        hasColumns={false}
        onOpenSettings={() => {}}
      />,
    );

    expect(screen.getByText("Set Up Columns")).toBeInTheDocument();
  });

  it("calls onOpenSettings when button clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <EmptyState
        hasSettings={false}
        hasColumns={false}
        onOpenSettings={onOpen}
      />,
    );

    await user.click(screen.getByText("Open Settings"));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
