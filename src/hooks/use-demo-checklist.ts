import { useCallback, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { nanoid } from "nanoid";
import { useBoardCollections } from "@/db/use-board-collections";
import type { DemoChecklistItem } from "@/types/demo";

export function useDemoChecklist(workItemId: number) {
  const { demoChecklist } = useBoardCollections();
  const result = useLiveQuery(demoChecklist);
  const allItems = result.data;
  const items = useMemo(
    () =>
      allItems
        .filter((i) => i.workItemId === workItemId)
        .sort((a, b) => a.order - b.order),
    [allItems, workItemId],
  );

  const addItem = useCallback(
    (text: string) => {
      const item: DemoChecklistItem = {
        id: nanoid(),
        workItemId,
        text,
        checked: false,
        order: items.length === 0 ? 0 : Math.max(...items.map((i) => i.order)) + 1,
      };
      demoChecklist.insert(item);
    },
    [demoChecklist, workItemId, items],
  );

  const toggleItem = useCallback(
    (id: string) => {
      if (demoChecklist.get(id)) {
        demoChecklist.update(id, (d) => {
          d.checked = !d.checked;
        });
      }
    },
    [demoChecklist],
  );

  const removeItem = useCallback(
    (id: string) => {
      if (demoChecklist.get(id)) {
        demoChecklist.delete([id]);
      }
    },
    [demoChecklist],
  );

  return { items, addItem, toggleItem, removeItem };
}
