import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { CopyableId } from "./copyable-id";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
});

describe("CopyableId", () => {
  const user = userEvent.setup();

  it("renders the id with # prefix", () => {
    renderWithProviders(<CopyableId id={42} />);
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("has accessible label", () => {
    renderWithProviders(<CopyableId id={42} />);
    expect(screen.getByLabelText("Copy ID 42")).toBeInTheDocument();
  });

  it("copies id to clipboard on click", async () => {
    renderWithProviders(<CopyableId id={42} />);
    await user.click(screen.getByLabelText("Copy ID 42"));
    expect(writeText).toHaveBeenCalledWith("42");
  });

  it("shows check icon after copy", async () => {
    renderWithProviders(<CopyableId id={42} />);
    const btn = screen.getByLabelText("Copy ID 42");

    // Before click: copy icon visible
    expect(btn.querySelector(".lucide-copy")).toBeInTheDocument();

    await user.click(btn);

    // After click: check icon replaces copy icon
    expect(btn.querySelector(".lucide-check")).toBeInTheDocument();
    expect(btn.querySelector(".lucide-copy")).not.toBeInTheDocument();
  });

  it("reverts to copy icon after delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fakeUser = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithProviders(<CopyableId id={42} />);
    const btn = screen.getByLabelText("Copy ID 42");

    await fakeUser.click(btn);
    expect(btn.querySelector(".lucide-check")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));
    expect(btn.querySelector(".lucide-copy")).toBeInTheDocument();
    expect(btn.querySelector(".lucide-check")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("stops event propagation", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <div onClick={onClick}>
        <CopyableId id={42} />
      </div>,
    );
    await user.click(screen.getByLabelText("Copy ID 42"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies custom className", () => {
    renderWithProviders(<CopyableId id={42} className="text-[10px]" />);
    expect(screen.getByLabelText("Copy ID 42")).toHaveClass("text-[10px]");
  });
});
