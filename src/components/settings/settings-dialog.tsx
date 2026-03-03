import { useState, useEffect } from "react";
import { Link, Filter, Columns3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConnectionForm } from "./connection-form";
import { SourceStateInput } from "./source-state-input";
import { ColumnsEditor } from "./columns-editor";
import { useBoardCollections } from "@/db/provider";
import { useSettings, useColumns } from "@/hooks/use-board";
import { DEFAULT_SETTINGS, type BoardColumn, type AdoSettings } from "@/types/board";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const collections = useBoardCollections();
  const currentSettings = useSettings();
  const currentColumns = useColumns();

  const [draft, setDraft] = useState<AdoSettings>(DEFAULT_SETTINGS);
  const [draftColumns, setDraftColumns] = useState<BoardColumn[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(currentSettings ?? DEFAULT_SETTINGS);
      setDraftColumns(currentColumns);
    }
  }, [open, currentSettings, currentColumns]);

  const handleFieldChange = (field: string, value: string | number) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleSave = async () => {
    const existing = collections.settings.get("settings");
    if (existing) {
      collections.settings.update("settings", (d: any) => {
        Object.assign(d, draft);
      });
    } else {
      collections.settings.insert({ ...draft, id: "settings" } as any);
    }

    const currentIds = new Set(currentColumns.map((c) => c.id));
    const draftIds = new Set(draftColumns.map((c) => c.id));

    const toRemove = currentColumns.filter((c) => !draftIds.has(c.id));
    for (const col of toRemove) {
      if (collections.columns.get(col.id)) {
        collections.columns.delete(col.id);
      }
    }

    for (const col of draftColumns) {
      if (currentIds.has(col.id)) {
        collections.columns.update(col.id, (d: any) => {
          d.name = col.name;
          d.order = col.order;
        });
      } else {
        collections.columns.insert(col as any);
      }
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Settings</DialogTitle>
          <DialogDescription>
            Configure your Azure DevOps connection and board layout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Link className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Connection</h3>
            </div>
            <ConnectionForm
              pat={draft.pat}
              org={draft.org}
              project={draft.project}
              team={draft.team}
              onChange={handleFieldChange}
            />
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Source</h3>
            </div>
            <SourceStateInput
              sourceState={draft.sourceState}
              approvalState={draft.approvalState}
              closedState={draft.closedState}
              candidateState={draft.candidateState}
              areaPath={draft.areaPath}
              workItemTypes={draft.workItemTypes}
              pollInterval={draft.pollInterval}
              onChange={handleFieldChange}
            />
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Columns3 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Board Columns</h3>
            </div>
            <ColumnsEditor
              columns={draftColumns}
              onAdd={(col) => setDraftColumns((c) => [...c, col])}
              onRemove={(id) =>
                setDraftColumns((c) => c.filter((col) => col.id !== id))
              }
              onRename={(id, name) =>
                setDraftColumns((c) =>
                  c.map((col) => (col.id === id ? { ...col, name } : col)),
                )
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
