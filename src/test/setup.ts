import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { ensureLocalStorageApi } from "./local-storage-shim";

// Polyfill ResizeObserver for jsdom (needed by @dnd-kit)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

ensureLocalStorageApi();

afterEach(() => {
  cleanup();
});
