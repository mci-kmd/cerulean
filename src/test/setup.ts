import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { ensureLocalStorageApi } from "./local-storage-shim";

// Polyfill ResizeObserver for jsdom (needed by @dnd-kit)
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      void callback;
    }
    observe(target: Element, options?: ResizeObserverOptions) {
      void target;
      void options;
    }
    unobserve(target: Element) {
      void target;
    }
    disconnect() {}
    takeRecords(): ResizeObserverEntry[] {
      return [];
    }
  }

  globalThis.ResizeObserver = ResizeObserverMock;
}

ensureLocalStorageApi();

afterEach(() => {
  cleanup();
});
