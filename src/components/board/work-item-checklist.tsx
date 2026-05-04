import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkItemChecklistItem } from "@/types/board";

interface WorkItemChecklistProps {
  items: WorkItemChecklistItem[];
  autoFocusItemId?: string | null;
  toggleItem: (id: string) => void;
  updateText: (id: string, text: string) => void;
  removeItem: (id: string) => void;
  onAutoFocusComplete?: () => void;
}

function ChecklistRow({
  item,
  autoFocus,
  toggleItem,
  updateText,
  removeItem,
  onAutoFocusComplete,
}: {
  item: WorkItemChecklistItem;
  autoFocus: boolean;
  toggleItem: (id: string) => void;
  updateText: (id: string, text: string) => void;
  removeItem: (id: string) => void;
  onAutoFocusComplete?: () => void;
}) {
  const [text, setText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    onAutoFocusComplete?.();
  }, [autoFocus, onAutoFocusComplete]);

  const commitText = () => {
    if (text !== item.text) {
      updateText(item.id, text);
    }
  };

  return (
    <li className="flex items-center gap-2">
      <Checkbox
        checked={item.checked}
        onCheckedChange={() => toggleItem(item.id)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Toggle checklist item ${text || item.id}`}
        className="shrink-0 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      />
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Checklist item ${text || item.id}`}
        placeholder="Checklist item"
        className={`h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1 ${
          item.checked ? "text-muted-foreground line-through" : ""
        }`}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeItem(item.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="ml-auto shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Delete checklist item ${text || item.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Delete checklist item</TooltipContent>
      </Tooltip>
    </li>
  );
}

export function WorkItemChecklist({
  items,
  autoFocusItemId,
  toggleItem,
  updateText,
  removeItem,
  onAutoFocusComplete,
}: WorkItemChecklistProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Checklist
      </h4>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            autoFocus={autoFocusItemId === item.id}
            toggleItem={toggleItem}
            updateText={updateText}
            removeItem={removeItem}
            onAutoFocusComplete={onAutoFocusComplete}
          />
        ))}
      </ul>
    </div>
  );
}
