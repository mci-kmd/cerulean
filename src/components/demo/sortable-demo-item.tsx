import { useSortable } from "@dnd-kit/react/sortable";
import { DemoItem } from "./demo-item";
import type { DemoWorkItem } from "@/types/demo";

interface SortableDemoItemProps {
  item: DemoWorkItem;
  index: number;
  isActive: boolean;
  isApproved: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
}

export function SortableDemoItem({
  item,
  index,
  isActive,
  isApproved,
  onSelect,
  onApprove,
  onUnapprove,
}: SortableDemoItemProps) {
  const { ref, isDragSource } = useSortable({
    id: item.id,
    index,
    group: "demo",
    data: { workItemId: item.id },
    disabled: isApproved,
  });

  return (
    <DemoItem
      item={item}
      isActive={isActive}
      isApproved={isApproved}
      onSelect={onSelect}
      onApprove={onApprove}
      onUnapprove={onUnapprove}
      sortableRef={ref}
      isDragSource={isDragSource}
    />
  );
}
