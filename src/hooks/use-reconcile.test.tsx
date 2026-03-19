import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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

  it("adds new work items to the first local column", async () => {
    const columns = createDefaultColumns();
    const workItems = [
      createWorkItem({ id: 100, boardColumnName: "To Do" }),
      createWorkItem({ id: 200, boardColumnName: "In Progress" }),
    ];

    renderHook(
      () => useReconcile(workItems, [], columns, collections),
      { wrapper },
    );

    await waitFor(() => {
      const arr = collections.assignments.toArray;
      expect(arr.length).toBe(2);
      expect(arr.find((assignment) => assignment.workItemId === 100)?.columnId).toBe("col-todo");
      expect(arr.find((assignment) => assignment.workItemId === 200)?.columnId).toBe("col-todo");
    });
  });

  it("removes stale assignments", async () => {
    const columns = createDefaultColumns();
    const assignment = createAssignment({
      id: "stale-1",
      workItemId: 999,
      columnId: "col-todo",
    });
    collections.assignments.insert(assignment);

    // No work items match
    renderHook(
      () => useReconcile([], [assignment], columns, collections),
      { wrapper },
    );

    await waitFor(() => {
      expect(collections.assignments.toArray.length).toBe(0);
    });
  });

  it("preserves assignments until initial load completes", async () => {
    const columns = createDefaultColumns();
    const assignment = createAssignment({
      id: "persisted-1",
      workItemId: 999,
      columnId: "col-todo",
    });
    collections.assignments.insert(assignment);

    renderHook(
      () => useReconcile([], [assignment], columns, collections, false),
      { wrapper },
    );

    await waitFor(() => {
      expect(collections.assignments.toArray.length).toBe(1);
    });
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
      () => useReconcile([], [assignment], columns, collections),
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
