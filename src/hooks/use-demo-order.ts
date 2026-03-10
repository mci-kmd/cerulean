import { useCallback, useEffect, useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { nanoid } from "nanoid";
import { useBoardCollections } from "@/db/use-board-collections";
import type { DemoWorkItem, DemoOrderItem } from "@/types/demo";

export function useDemoOrder(items: DemoWorkItem[]) {
  const { demoOrder } = useBoardCollections();
  const result = useLiveQuery(demoOrder);
  const orderItems = result.data;

  // Build a position map from persisted order
  const positionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of orderItems) {
      map.set(o.workItemId, o.position);
    }
    return map;
  }, [orderItems]);

  // Ensure every item has an order entry; assign positions to new items
  useEffect(() => {
    const existing = new Set(orderItems.map((o) => o.workItemId));
    let maxPos = orderItems.length > 0
      ? Math.max(...orderItems.map((o) => o.position))
      : -1;

    for (const item of items) {
      if (!existing.has(item.id)) {
        maxPos += 1;
        demoOrder.insert({
          id: nanoid(),
          workItemId: item.id,
          position: maxPos,
        });
      }
    }
  }, [items, orderItems, demoOrder]);

  // Sort items by persisted position, unordered items go to end
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const posA = positionMap.get(a.id) ?? Infinity;
      const posB = positionMap.get(b.id) ?? Infinity;
      return posA - posB;
    });
  }, [items, positionMap]);

  const reorder = useCallback(
    (sourceWorkItemId: number, targetIndex: number, sortedIds: number[]) => {
      // Get order entries for the sorted list (excluding the source)
      const others = sortedIds.filter((id) => id !== sourceWorkItemId);
      const otherOrders = others
        .map((id) => orderItems.find((o) => o.workItemId === id))
        .filter((item): item is DemoOrderItem => item !== undefined);

      let newPosition: number;
      if (targetIndex < otherOrders.length) {
        const atIndex = otherOrders[targetIndex];
        const prevPos = targetIndex > 0
          ? otherOrders[targetIndex - 1].position
          : atIndex.position - 1;
        newPosition = (prevPos + atIndex.position) / 2;
      } else {
        const lastPos = otherOrders.length > 0
          ? otherOrders[otherOrders.length - 1].position
          : 0;
        newPosition = lastPos + 1;
      }

      const sourceOrder = orderItems.find(
        (o) => o.workItemId === sourceWorkItemId,
      );
      if (sourceOrder) {
        demoOrder.update(sourceOrder.id, (draft) => {
          draft.position = newPosition;
        });
      }
    },
    [orderItems, demoOrder],
  );

  return { sortedItems, reorder };
}
