import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardCollectionsProvider } from "@/db/provider";
import {
  createBoardCollections,
  type BoardCollections,
} from "@/db/create-collections";
import { useWorkItemChecklist } from "./use-work-item-checklist";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `check-${++i}`;
  })(),
}));

describe("useWorkItemChecklist", () => {
  let collections: BoardCollections;
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BoardCollectionsProvider collections={collections}>
          {children}
        </BoardCollectionsProvider>
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    collections = createBoardCollections(true);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("adds a checklist item", async () => {
    const { result } = renderHook(() => useWorkItemChecklist(42), { wrapper });

    act(() => {
      result.current.addItem("Test coverage");
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].text).toBe("Test coverage");
      expect(result.current.items[0].checked).toBe(false);
      expect(result.current.items[0].workItemId).toBe(42);
    });
  });

  it("toggles a checklist item", async () => {
    const { result } = renderHook(() => useWorkItemChecklist(42), { wrapper });

    act(() => {
      result.current.addItem("Step 1");
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.toggleItem(result.current.items[0].id);
    });

    await waitFor(() => {
      expect(result.current.items[0].checked).toBe(true);
    });
  });

  it("updates checklist text", async () => {
    const { result } = renderHook(() => useWorkItemChecklist(42), { wrapper });

    act(() => {
      result.current.addItem("Old text");
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.updateText(result.current.items[0].id, "New text");
    });

    await waitFor(() => {
      expect(result.current.items[0].text).toBe("New text");
    });
  });

  it("removes a checklist item", async () => {
    const { result } = renderHook(() => useWorkItemChecklist(42), { wrapper });

    act(() => {
      result.current.addItem("Removable");
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.removeItem(result.current.items[0].id);
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0);
    });
  });

  it("filters items by workItemId", async () => {
    const { result: hook42 } = renderHook(() => useWorkItemChecklist(42), {
      wrapper,
    });
    const { result: hook99 } = renderHook(() => useWorkItemChecklist(99), {
      wrapper,
    });

    act(() => {
      hook42.current.addItem("For 42");
      hook99.current.addItem("For 99");
    });

    await waitFor(() => {
      expect(hook42.current.items).toHaveLength(1);
      expect(hook42.current.items[0].text).toBe("For 42");
      expect(hook99.current.items).toHaveLength(1);
      expect(hook99.current.items[0].text).toBe("For 99");
    });
  });
});
