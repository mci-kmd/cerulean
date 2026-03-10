import { describe, expect, it, vi } from "vitest";
import { scheduleDndMutation } from "./schedule-dnd-mutation";

describe("scheduleDndMutation", () => {
  it("defers mutation to a microtask", async () => {
    const mutation = vi.fn();

    scheduleDndMutation(mutation);
    expect(mutation).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(mutation).toHaveBeenCalledTimes(1);
  });
});
