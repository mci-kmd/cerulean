import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { useCustomTasks, customTasksToWorkItems } from "./use-custom-tasks";
import { CUSTOM_TASK_TYPE } from "@/lib/work-item-types";

function TaskList() {
  const tasks = useCustomTasks();
  return (
    <ul>
      {tasks.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}

describe("useCustomTasks", () => {
  it("returns empty array initially", () => {
    renderWithProviders(<TaskList />);
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("returns inserted tasks", async () => {
    const { collections } = renderWithProviders(<TaskList />);
    collections.customTasks.insert({
      id: "t-1",
      workItemId: -1000,
      title: "My task",
    } as any);

    await waitFor(() => {
      expect(screen.getByText("My task")).toBeInTheDocument();
    });
  });
});

describe("customTasksToWorkItems", () => {
  it("converts custom tasks to WorkItem format", () => {
    const tasks = [
      { id: "t-1", workItemId: -1000, title: "Task A" },
      { id: "t-2", workItemId: -2000, title: "Task B" },
    ];
    const items = customTasksToWorkItems(tasks);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: -1000,
      title: "Task A",
      type: CUSTOM_TASK_TYPE,
      state: "Active",
      rev: 0,
      url: "",
    });
    expect(items[1].id).toBe(-2000);
  });

  it("returns empty array for no tasks", () => {
    expect(customTasksToWorkItems([])).toEqual([]);
  });
});
