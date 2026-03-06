import { useLiveQuery } from "@tanstack/react-db";
import { useBoardCollections } from "@/db/provider";
import { CUSTOM_TASK_TYPE } from "@/lib/work-item-types";
import type { CustomTask, WorkItem } from "@/types/board";

export function useCustomTasks(): CustomTask[] {
  const { customTasks } = useBoardCollections();
  const result = useLiveQuery(customTasks);
  return (result.data ?? []) as unknown as CustomTask[];
}

export function customTasksToWorkItems(tasks: CustomTask[]): WorkItem[] {
  return tasks.map((t) => ({
    id: t.workItemId,
    title: t.title,
    type: CUSTOM_TASK_TYPE,
    state: "Active",
    rev: 0,
    url: "",
  }));
}
