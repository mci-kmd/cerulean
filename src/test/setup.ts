import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, vi } from "vitest";
import { ensureLocalStorageApi } from "./local-storage-shim";

vi.mock("draftly/editor", () => ({
  draftly: (config: unknown) => ({ extension: "draftly", config }),
  ThemeEnum: {
    AUTO: "auto",
  },
}));

vi.mock("draftly/plugins", () => ({
  essentialPlugins: ["essential-plugin"],
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value = "",
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) =>
    createElement("textarea", {
      "aria-label": "Draft markdown",
      value,
      placeholder,
      onChange: (event: { target: { value: string } }) => onChange?.(event.target.value),
    }),
}));

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
