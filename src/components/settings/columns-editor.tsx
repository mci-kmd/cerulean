import { useState } from "react";
import { nanoid } from "nanoid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus, GripVertical } from "lucide-react";
import type { BoardColumn } from "@/types/board";

interface ColumnsEditorProps {
  columns: BoardColumn[];
  onAdd: (col: BoardColumn) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function ColumnsEditor({
  columns,
  onAdd,
  onRemove,
  onRename,
}: ColumnsEditorProps) {
  const [newName, setNewName] = useState("");

  const sorted = [...columns].sort((a, b) => a.order - b.order);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd({
      id: nanoid(),
      name,
      order: (sorted.at(-1)?.order ?? 0) + 1,
    });
    setNewName("");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sorted.map((col) => (
          <div key={col.id} className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={col.name}
              onChange={(e) => onRename(col.id, e.target.value)}
              className="h-8"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onRemove(col.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New column name"
          className="h-8"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button variant="outline" size="sm" onClick={handleAdd} disabled={!newName.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}
