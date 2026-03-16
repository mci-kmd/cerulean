import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveDndManagerSettled,
  scheduleDndMutation,
  setDndRenderSettledResolver,
} from "./schedule-dnd-mutation";

describe("scheduleDndMutation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setDndRenderSettledResolver(undefined);
  });

  it("defers mutation to macrotask scheduling", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const mutation = vi.fn();

    scheduleDndMutation(mutation);

    expect(mutation).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("remains deferred even when requestAnimationFrame exists", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
    const mutation = vi.fn();

    scheduleDndMutation(mutation);
    expect(mutation).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("waits for render settling promise before deferring mutation", async () => {
    vi.useFakeTimers();
    const mutation = vi.fn();
    let resolveRendering!: () => void;
    const renderSettled = new Promise<void>((resolve) => {
      resolveRendering = resolve;
    });

    scheduleDndMutation(mutation, renderSettled);
    vi.runAllTimers();
    expect(mutation).not.toHaveBeenCalled();

    resolveRendering();
    await Promise.resolve();

    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("waits for latest render-settled promise when provider rerenders", async () => {
    vi.useFakeTimers();
    const mutation = vi.fn();
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const getter = vi
      .fn<() => Promise<void> | undefined>()
      .mockReturnValueOnce(first)
      .mockReturnValue(second);

    scheduleDndMutation(mutation, getter);
    vi.runAllTimers();
    expect(mutation).not.toHaveBeenCalled();

    resolveFirst();
    await Promise.resolve();
    vi.runAllTimers();
    expect(mutation).not.toHaveBeenCalled();

    resolveSecond();
    await Promise.resolve();
    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("uses global render-settled resolver when explicit resolver is absent", async () => {
    vi.useFakeTimers();
    const mutation = vi.fn();
    let resolveRendering!: () => void;
    const renderSettled = new Promise<void>((resolve) => {
      resolveRendering = resolve;
    });
    setDndRenderSettledResolver(() => renderSettled);

    scheduleDndMutation(mutation);
    vi.runAllTimers();
    expect(mutation).not.toHaveBeenCalled();

    resolveRendering();
    await Promise.resolve();
    vi.runAllTimers();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("waits for drag operation idle when resolving manager settled state", async () => {
    vi.useFakeTimers();
    const status = { idle: false };
    const settled = resolveDndManagerSettled({ dragOperation: { status } });
    const resolved = vi.fn();
    settled?.then(resolved);

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    status.idle = true;
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it("waits for both rendering and drag idle in manager settled state", async () => {
    vi.useFakeTimers();
    const status = { idle: false };
    let resolveRendering!: () => void;
    const rendering = new Promise<void>((resolve) => {
      resolveRendering = resolve;
    });
    const settled = resolveDndManagerSettled({
      renderer: { rendering },
      dragOperation: { status },
    });
    const resolved = vi.fn();
    settled?.then(resolved);

    resolveRendering();
    await Promise.resolve();
    vi.advanceTimersByTime(32);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    status.idle = true;
    vi.runAllTimers();
    await settled;
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it("retries transient removeChild DOMException multiple times", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const mutation = vi
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new DOMException(
          "Node.removeChild: The node to be removed is not a child of this node",
          "NotFoundError",
        );
      })
      .mockImplementationOnce(() => {
        throw new DOMException(
          "Node.removeChild: The node to be removed is not a child of this node",
          "NotFoundError",
        );
      })
      .mockImplementationOnce(() => {
        throw new DOMException(
          "Node.removeChild: The node to be removed is not a child of this node",
          "NotFoundError",
        );
      })
      .mockImplementation(() => {});

    scheduleDndMutation(mutation);

    expect(() => vi.runAllTimers()).not.toThrow();
    expect(mutation).toHaveBeenCalledTimes(4);
  });

  it("retries transient removeChild errors even when thrown as Error", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const mutation = vi
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error(
          "Node.removeChild: The node to be removed is not a child of this node",
        );
      })
      .mockImplementation(() => {});

    scheduleDndMutation(mutation);

    expect(() => vi.runAllTimers()).not.toThrow();
    expect(mutation).toHaveBeenCalledTimes(2);
  });

  it("rethrows when transient removeChild keeps failing after retries", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const mutation = vi.fn<() => void>(() => {
      throw new DOMException(
        "Node.removeChild: The node to be removed is not a child of this node",
        "NotFoundError",
      );
    });

    scheduleDndMutation(mutation);

    expect(() => vi.runAllTimers()).toThrow();
    expect(mutation).toHaveBeenCalledTimes(4);
  });
});
