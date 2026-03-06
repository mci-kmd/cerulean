import { useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useBoardCollections } from "@/db/provider";
import { CUSTOM_TASK_TYPE } from "@/lib/work-item-types";
import type { CustomTask, WorkItem } from "@/types/board";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export function useCustomTasks(): CustomTask[] {
  const { customTasks } = useBoardCollections();
  const result = useLiveQuery(customTasks);
  const all = (result.data ?? []) as unknown as CustomTask[];

  return useMemo(() => {
    const now = Date.now();
    return all.filter(
      (t) => !t.completedAt || now - t.completedAt < TWENTY_FOUR_HOURS,
    );
  }, [all]);
}

export function customTasksToWorkItems(tasks: CustomTask[], approvalState?: string): WorkItem[] {
  return tasks.map((t) => ({
    id: t.workItemId,
    title: t.title,
    type: CUSTOM_TASK_TYPE,
    state: t.completedAt ? (approvalState || "Completed") : "Active",
    rev: 0,
    url: "",
  }));
}
