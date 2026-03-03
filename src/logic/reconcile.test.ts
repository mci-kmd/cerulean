import { describe, it, expect, vi } from "vitest";
import { reconcile } from "./reconcile";
import { createWorkItem } from "@/test/fixtures/work-items";
import { createDefaultColumns, createAssignment } from "@/test/fixtures/columns";

// Stabilize nanoid for tests
vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `nano-${++i}`;
  })(),
}));

describe("reconcile", () => {
  const columns = createDefaultColumns();

  it("adds new items to first column", () => {
    const items = [createWorkItem({ id: 10 }), createWorkItem({ id: 20 })];
    const result = reconcile([], items, columns);

    expect(result.added).toHaveLength(2);
    expect(result.added[0].columnId).toBe("col-todo");
    expect(result.added[0].workItemId).toBe(10);
    expect(result.added[1].workItemId).toBe(20);
    expect(result.removed).toHaveLength(0);
  });

  it("removes stale assignments", () => {
    const assignments = [
      createAssignment({ id: "a1", workItemId: 1, columnId: "col-todo" }),
      createAssignment({ id: "a2", workItemId: 2, columnId: "col-doing" }),
    ];
    const items = [createWorkItem({ id: 1 })]; // item 2 gone

    const result = reconcile(assignments, items, columns);
    expect(result.removed).toEqual(["a2"]);
    expect(result.added).toHaveLength(0);
  });

  it("preserves existing assignments", () => {
    const assignments = [
      createAssignment({ id: "a1", workItemId: 1, columnId: "col-doing" }),
    ];
    const items = [createWorkItem({ id: 1 })];

    const result = reconcile(assignments, items, columns);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("handles empty columns gracefully", () => {
    const result = reconcile([], [createWorkItem({ id: 1 })], []);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("positions new items after existing ones in first column", () => {
    const assignments = [
      createAssignment({
        id: "a1",
        workItemId: 1,
        columnId: "col-todo",
        position: 5,
      }),
    ];
    const items = [
      createWorkItem({ id: 1 }),
      createWorkItem({ id: 2 }),
    ];

    const result = reconcile(assignments, items, columns);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].position).toBeGreaterThan(5);
  });
});
