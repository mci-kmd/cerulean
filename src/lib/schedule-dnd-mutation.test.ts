import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleDndMutation } from "./schedule-dnd-mutation";

describe("scheduleDndMutation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("defers mutation until after animation-frame scheduling", () => {
    vi.useFakeTimers();
    const raf = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    const mutation = vi.fn();

    scheduleDndMutation(mutation);

    expect(raf).toHaveBeenCalledTimes(1);
    expect(mutation).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("falls back to timeout when animation frame is unavailable", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const mutation = vi.fn();

    scheduleDndMutation(mutation);
    expect(mutation).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });
});
