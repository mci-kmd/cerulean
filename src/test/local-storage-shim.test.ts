import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureLocalStorageApi } from "./local-storage-shim";

describe("ensureLocalStorageApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds missing localStorage methods", () => {
    vi.stubGlobal("localStorage", {});

    ensureLocalStorageApi();

    expect(typeof globalThis.localStorage.getItem).toBe("function");
    expect(typeof globalThis.localStorage.setItem).toBe("function");
    expect(typeof globalThis.localStorage.removeItem).toBe("function");
    expect(typeof globalThis.localStorage.clear).toBe("function");

    globalThis.localStorage.setItem("k", "v");
    expect(globalThis.localStorage.getItem("k")).toBe("v");
    globalThis.localStorage.removeItem("k");
    expect(globalThis.localStorage.getItem("k")).toBeNull();
  });

  it("keeps existing Storage-like localStorage intact", () => {
    const existing: Storage = {
      get length() {
        return 0;
      },
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", existing);

    ensureLocalStorageApi();

    expect(globalThis.localStorage).toBe(existing);
  });
});
