import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardCollectionsProvider } from "@/db/provider";
import {
  createBoardCollections,
  type BoardCollections,
} from "@/db/create-collections";
import { useDemoOrder } from "./use-demo-order";
import type { DemoWorkItem } from "@/types/demo";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `order-${++i}`;
  })(),
}));

function makeItem(id: number, title = `Item ${id}`): DemoWorkItem {
  return {
    id,
    title,
    type: "User Story",
    state: "Resolved",
    url: `https://example.com/${id}`,
    description: "",
    acceptanceCriteria: "",
    reproSteps: "",
  };
}

describe("useDemoOrder", () => {
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

  it("returns items in original order when no persisted order", async () => {
    const items = [makeItem(1), makeItem(2), makeItem(3)];
    const { result } = renderHook(() => useDemoOrder(items), { wrapper });

    await waitFor(() => {
      expect(result.current.sortedItems.map((i) => i.id)).toEqual([1, 2, 3]);
    });
  });

  it("creates order entries for new items", async () => {
    const items = [makeItem(10), makeItem(20)];
    const { result } = renderHook(() => useDemoOrder(items), { wrapper });

    // After effect runs, items should be sorted (order entries created)
    await waitFor(() => {
      expect(result.current.sortedItems).toHaveLength(2);
      expect(result.current.sortedItems[0].id).toBe(10);
      expect(result.current.sortedItems[1].id).toBe(20);
    });
  });

  it("reorders items via reorder()", async () => {
    const items = [makeItem(1), makeItem(2), makeItem(3)];
    const { result } = renderHook(() => useDemoOrder(items), { wrapper });

    // Wait for initial order entries to be created
    await waitFor(() => {
      expect(result.current.sortedItems).toHaveLength(3);
    });

    // Move item 3 to index 0 (before item 1)
    act(() => {
      result.current.reorder(3, 0, [1, 2, 3]);
    });

    await waitFor(() => {
      const ids = result.current.sortedItems.map((i) => i.id);
      expect(ids[0]).toBe(3);
    });
  });

  it("reorders item to end", async () => {
    const items = [makeItem(1), makeItem(2), makeItem(3)];
    const { result } = renderHook(() => useDemoOrder(items), { wrapper });

    await waitFor(() => {
      expect(result.current.sortedItems).toHaveLength(3);
    });

    // Move item 1 to end (index 3, past all others)
    act(() => {
      result.current.reorder(1, 3, [1, 2, 3]);
    });

    await waitFor(() => {
      const ids = result.current.sortedItems.map((i) => i.id);
      expect(ids[2]).toBe(1);
    });
  });
});
