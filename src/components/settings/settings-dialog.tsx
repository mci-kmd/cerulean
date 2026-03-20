import { useState } from "react";
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
import { useBoardCollections } from "@/db/use-board-collections";
import { useSettings, useColumns } from "@/hooks/use-board";
import { normalizeAdoClientConfig } from "@/api/ado-client";
import { normalizeGithubReviewConfig } from "@/api/github-client";
import { DEFAULT_SETTINGS, type BoardColumn, type AdoSettings } from "@/types/board";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const collections = useBoardCollections();
  const currentSettings = useSettings();
  const currentColumns = useColumns();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SettingsDialogContent
          collections={collections}
          currentSettings={currentSettings ?? DEFAULT_SETTINGS}
          currentColumns={currentColumns}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function SettingsDialogContent({
  collections,
  currentSettings,
  currentColumns,
  onOpenChange,
}: {
  collections: ReturnType<typeof useBoardCollections>;
  currentSettings: AdoSettings;
  currentColumns: BoardColumn[];
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<AdoSettings>(currentSettings);
  const [draftColumns, setDraftColumns] = useState<BoardColumn[]>(currentColumns);

  const handleFieldChange = (field: string, value: string | number) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleSave = async () => {
    const normalizedConnection = normalizeAdoClientConfig({
      pat: draft.pat,
      org: draft.org,
      project: draft.project,
    });
    const normalizedGithubReview = normalizeGithubReviewConfig({
      username: draft.githubUsername,
      repository: draft.githubRepository,
    });
    const nextDraft: AdoSettings = {
      id: "settings",
      pat: normalizedConnection.pat,
      org: normalizedConnection.org,
      project: normalizedConnection.project,
      team: draft.team.trim(),
      githubUsername: normalizedGithubReview.username,
      githubRepository: normalizedGithubReview.repository,
      sourceState: "",
      sourceBoardColumn: draft.sourceBoardColumn.trim(),
      candidateBoardColumn: draft.candidateBoardColumn.trim(),
      approvalState: "",
      approvalBoardColumn: draft.approvalBoardColumn.trim(),
      closedState: draft.closedState,
      candidateState: "",
      candidateStatesByType: "",
      areaPath: draft.areaPath,
      workItemTypes: draft.workItemTypes,
      uiReviewTag: draft.uiReviewTag.trim(),
      pollInterval: draft.pollInterval,
    };

    const existing = collections.settings.get("settings");
    if (existing) {
      collections.settings.delete("settings");
    }
    collections.settings.insert(nextDraft);

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
        collections.columns.update(col.id, (d: BoardColumn) => {
          d.name = col.name;
          d.order = col.order;
        });
      } else {
        collections.columns.insert(col);
      }
    }

    onOpenChange(false);
  };

  return (
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-heading">Settings</DialogTitle>
        <DialogDescription>
          Configure your Azure DevOps connection, optional GitHub review source, and board layout.
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
            githubUsername={draft.githubUsername}
            githubRepository={draft.githubRepository}
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
            sourceBoardColumn={draft.sourceBoardColumn}
            candidateBoardColumn={draft.candidateBoardColumn}
            approvalBoardColumn={draft.approvalBoardColumn}
            closedState={draft.closedState}
            areaPath={draft.areaPath}
            workItemTypes={draft.workItemTypes}
            uiReviewTag={draft.uiReviewTag}
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
  );
}
