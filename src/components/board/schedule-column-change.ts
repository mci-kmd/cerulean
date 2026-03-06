export function scheduleColumnChange(
  onColumnChange: (workItemId: number, fromColumnId: string, toColumnId: string) => void,
  workItemId: number,
  fromColumnId: string,
  toColumnId: string,
) {
  queueMicrotask(() => onColumnChange(workItemId, fromColumnId, toColumnId));
}
