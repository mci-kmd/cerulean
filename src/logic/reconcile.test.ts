import { describe, it, expect, vi } from "vitest";
import { reconcile } from "./reconcile";
import { createWorkItem } from "@/test/fixtures/work-items";
import { createDefaultColumns, createAssignment } from "@/test/fixtures/columns";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `nano-${++i}`;
  })(),
}));

describe("reconcile", () => {
  const columns = createDefaultColumns();

  it("adds active items to the first local column", () => {
    const items = [
      createWorkItem({ id: 10, boardColumnName: "To Do" }),
      createWorkItem({ id: 20, boardColumnName: "In Progress" }),
    ];

    const result = reconcile([], items, columns);

    expect(result.added).toHaveLength(2);
    expect(result.added.find((assignment) => assignment.workItemId === 10)?.columnId).toBe(
      "col-todo",
    );
    expect(result.added.find((assignment) => assignment.workItemId === 20)?.columnId).toBe("col-todo");
    expect(result.removed).toHaveLength(0);
  });

  it("appends new items after existing assignments in the first local column", () => {
    const assignments = [
      createAssignment({
        id: "a1",
        workItemId: 1,
        columnId: "col-todo",
        position: 5,
      }),
    ];
    const items = [
      createWorkItem({ id: 1, boardColumnName: "To Do" }),
      createWorkItem({ id: 2, boardColumnName: "To Do" }),
    ];

    const result = reconcile(assignments, items, columns);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({
      workItemId: 2,
      columnId: "col-todo",
      position: 6,
    });
  });

  it("routes candidate ids to New Work", () => {
    const items = [
      createWorkItem({ id: 10, boardColumnName: "To Do" }),
      createWorkItem({ id: 20, boardColumnName: "In Progress" }),
    ];

    const result = reconcile([], items, columns, undefined, undefined, undefined, new Set([10]));

    expect(result.added.find((assignment) => assignment.workItemId === 10)?.columnId).toBe(
      "__new_work__",
    );
    expect(result.added.find((assignment) => assignment.workItemId === 20)?.columnId).toBe("col-todo");
  });

  it("routes completed ids to Completed even when board column matches a local column", () => {
    const items = [
      createWorkItem({ id: 10, boardColumnName: "Done" }),
      createWorkItem({ id: 20, boardColumnName: "To Do" }),
    ];

    const result = reconcile(
      [],
      items,
      columns,
      undefined,
      undefined,
      undefined,
      undefined,
      new Set([10]),
    );

    expect(result.added.find((assignment) => assignment.workItemId === 10)?.columnId).toBe(
      "__completed__",
    );
    expect(result.added.find((assignment) => assignment.workItemId === 20)?.columnId).toBe(
      "col-todo",
    );
  });

  it("still adds active items when board column names do not match local columns", () => {
    const items = [createWorkItem({ id: 10, boardColumnName: "Approved" })];

    const result = reconcile([], items, columns);

    expect(result.added).toMatchObject([{ workItemId: 10, columnId: "col-todo" }]);
    expect(result.updated).toEqual(items);
  });

  it("removes stale assignments", () => {
    const assignments = [
      createAssignment({ id: "a1", workItemId: 1, columnId: "col-todo" }),
      createAssignment({ id: "a2", workItemId: 2, columnId: "col-doing" }),
    ];
    const items = [createWorkItem({ id: 1, boardColumnName: "To Do" })];

    const result = reconcile(assignments, items, columns);

    expect(result.removed).toEqual(["a2"]);
    expect(result.added).toHaveLength(0);
  });

  it("handles empty columns gracefully", () => {
    const result = reconcile([], [createWorkItem({ id: 1, boardColumnName: "To Do" })], []);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });
});
