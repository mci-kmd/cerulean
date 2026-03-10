import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { ensureLocalStorageApi } from "./local-storage-shim";

// Polyfill ResizeObserver for jsdom (needed by @dnd-kit)
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

ensureLocalStorageApi();

afterEach(() => {
  cleanup();
});
