import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDemoChecklist } from "@/hooks/use-demo-checklist";

interface DemoChecklistProps {
  workItemId: number;
}

export function DemoChecklist({ workItemId }: DemoChecklistProps) {
  const { items, addItem, toggleItem, removeItem } =
    useDemoChecklist(workItemId);
  const [newText, setNewText] = useState("");

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    addItem(text);
    setNewText("");
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checklist</h4>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 group">
          <Checkbox
            checked={item.checked}
            onCheckedChange={() => toggleItem(item.id)}
            aria-label={item.text}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <span
            className={`text-sm flex-1 ${item.checked ? "line-through text-muted-foreground" : ""}`}
          >
            {item.text}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => removeItem(item.id)}
            aria-label={`Remove ${item.text}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add checklist item..."
          className="h-8 text-sm"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleAdd}
          aria-label="Add item"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
