import { useLiveQuery } from "@tanstack/react-db";
import { nanoid } from "nanoid";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import { useBoardCollections } from "@/db/use-board-collections";
import type { WorkItemChecklistItem } from "@/types/board";

export function useWorkItemChecklist(workItemId: number) {
  const { boardChecklist } = useBoardCollections();
  const result = useLiveQuery(boardChecklist);
  const allItems = result.data;
  const items = allItems
    .filter((item) => item.workItemId === workItemId)
    .sort((a, b) => a.order - b.order);

  function addItem(text = "New checklist item") {
    const nextOrder =
      items.length === 0 ? 0 : Math.max(...items.map((item) => item.order)) + 1;
    const item: WorkItemChecklistItem = {
      id: nanoid(),
      workItemId,
      text,
      checked: false,
      order: nextOrder,
    };
    scheduleDndMutation(() => {
      boardChecklist.insert(item);
    });
    return item.id;
  }

  function toggleItem(id: string) {
    const item = allItems.find((entry) => entry.id === id);
    if (!item) return;
    scheduleDndMutation(() => {
      if (!boardChecklist.get(id)) return;
      boardChecklist.update(id, (draft) => {
        draft.checked = !item.checked;
      });
    });
  }

  function updateText(id: string, text: string) {
    if (!boardChecklist.get(id)) return;
    scheduleDndMutation(() => {
      if (!boardChecklist.get(id)) return;
      boardChecklist.update(id, (draft) => {
        draft.text = text;
      });
    });
  }

  function removeItem(id: string) {
    if (!boardChecklist.get(id)) return;
    scheduleDndMutation(() => {
      if (!boardChecklist.get(id)) return;
      boardChecklist.delete([id]);
    });
  }

  return { items, addItem, toggleItem, updateText, removeItem };
}
