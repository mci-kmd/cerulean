import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppErrorBoundary } from "@/components/app-error-boundary";

function ThrowOnRender(): null {
  throw new Error("boom");
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error is thrown", () => {
    render(
      <AppErrorBoundary>
        <div>Healthy app</div>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Healthy app")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws during render", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <ThrowOnRender />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      "Uncaught app error",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("swallows the known drag DOMException without logging it", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const knownDragError = new DOMException(
      "Node.removeChild: The node to be removed is not a child of this node",
      "NotFoundError",
    );
    const boundary = new AppErrorBoundary({ children: <div>Healthy app</div> });
    const setStateSpy = vi.spyOn(boundary, "setState");

    expect(AppErrorBoundary.getDerivedStateFromError(knownDragError)).toEqual({
      hasError: true,
      ignoredError: true,
    });

    boundary.componentDidCatch(knownDragError, { componentStack: "" });

    expect(setStateSpy).toHaveBeenCalledWith({ hasError: false, ignoredError: false });
    expect(errorSpy).not.toHaveBeenCalledWith(
      "Uncaught app error",
      expect.anything(),
      expect.anything(),
    );
  });
});
