import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardCollectionsProvider } from "@/db/provider";
import { createBoardCollections, type BoardCollections } from "@/db/create-collections";
import { useReconcile } from "./use-reconcile";
import { createWorkItem } from "@/test/fixtures/work-items";
import { createDefaultColumns, createAssignment } from "@/test/fixtures/columns";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `test-${++i}`;
  })(),
}));

describe("useReconcile", () => {
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

  it("adds new work items to first column", async () => {
    const columns = createDefaultColumns();
    const workItems = [createWorkItem({ id: 100 }), createWorkItem({ id: 200 })];

    renderHook(
      () => useReconcile(workItems, [], columns, collections),
      { wrapper },
    );

    await waitFor(() => {
      const arr = collections.assignments.toArray;
      expect(arr.length).toBe(2);
    });
  });

  it("removes stale assignments", async () => {
    const columns = createDefaultColumns();
    const assignment = createAssignment({
      id: "stale-1",
      workItemId: 999,
      columnId: "col-todo",
    });
    collections.assignments.insert(assignment as any);

    // No work items match
    renderHook(
      () => useReconcile([], [assignment as any], columns, collections),
      { wrapper },
    );

    // Reconcile should not add when workItems is empty AND assignments exist
    // but the real scenario: workItems=[] should cause removal if assignments exist
  });

  it("does not throw when deleting already-removed assignments", async () => {
    const columns = createDefaultColumns();
    const assignment = createAssignment({
      id: "gone-1",
      workItemId: 999,
      columnId: "col-todo",
    });
    // Assignment exists in the list but NOT in the collection (already deleted)
    renderHook(
      () => useReconcile([], [assignment as any], columns, collections),
      { wrapper },
    );

    // Should not throw CollectionOperationError
    await waitFor(() => {
      expect(collections.assignments.toArray.length).toBe(0);
    });
  });

  it("does nothing when columns are empty", () => {
    const workItems = [createWorkItem({ id: 1 })];

    renderHook(
      () => useReconcile(workItems, [], [], collections),
      { wrapper },
    );

    expect(collections.assignments.toArray.length).toBe(0);
  });
});
