import { useCallback } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { nanoid } from "nanoid";
import { useBoardCollections } from "@/db/provider";
import type { DemoChecklistItem } from "@/types/demo";

export function useDemoChecklist(workItemId: number) {
  const { demoChecklist } = useBoardCollections();
  const result = useLiveQuery(demoChecklist);
  const allItems = (result.data ?? []) as unknown as DemoChecklistItem[];
  const items = allItems
    .filter((i) => i.workItemId === workItemId)
    .sort((a, b) => a.order - b.order);

  const addItem = useCallback(
    (text: string) => {
      const item: DemoChecklistItem = {
        id: nanoid(),
        workItemId,
        text,
        checked: false,
        order: items.length,
      };
      demoChecklist.insert(item as any);
    },
    [demoChecklist, workItemId, items.length],
  );

  const toggleItem = useCallback(
    (id: string) => {
      const item = allItems.find((i) => i.id === id);
      if (item) {
        demoChecklist.update(id, (d: any) => {
          d.checked = !item.checked;
        });
      }
    },
    [demoChecklist, allItems],
  );

  const removeItem = useCallback(
    (id: string) => {
      demoChecklist.delete([id]);
    },
    [demoChecklist],
  );

  return { items, addItem, toggleItem, removeItem };
}
