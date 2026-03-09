import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateCard } from "./candidate-card";
import { createWorkItem } from "@/test/fixtures/work-items";

describe("CandidateCard", () => {
  it("renders title and ID", () => {
    const item = createWorkItem({ id: 42, title: "Fix login", type: "Bug" });
    render(<CandidateCard workItem={item} onStart={() => {}} isStarting={false} />);

    const link = screen.getByRole("link", { name: "Fix login" });
    expect(link).toHaveAttribute("href", item.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("calls onStart when Start clicked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const item = createWorkItem({ id: 10 });
    render(<CandidateCard workItem={item} onStart={onStart} isStarting={false} />);

    await user.click(screen.getByRole("button", { name: /start/i }));
    expect(onStart).toHaveBeenCalledWith(10);
  });

  it("shows spinner when starting", () => {
    const item = createWorkItem({ id: 1 });
    render(<CandidateCard workItem={item} onStart={() => {}} isStarting={true} />);

    expect(screen.getByRole("button")).toBeDisabled();
  });
});
