import { scheduleDndMutation, type DndRenderSettled } from "@/lib/schedule-dnd-mutation";

export function scheduleColumnChange(
  onColumnChange: (workItemId: number, fromColumnId: string, toColumnId: string) => void,
  workItemId: number,
  fromColumnId: string,
  toColumnId: string,
  renderSettled?: DndRenderSettled,
) {
  scheduleDndMutation(() => onColumnChange(workItemId, fromColumnId, toColumnId), renderSettled);
}
