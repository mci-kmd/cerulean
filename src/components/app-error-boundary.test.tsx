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
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <ThrowOnRender />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
  });
});
