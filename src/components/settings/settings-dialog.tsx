import { useState, type ReactNode } from "react";
import {
  Link,
  Filter,
  Columns3,
  FileText,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConnectionForm } from "./connection-form";
import { SourceStateInput } from "./source-state-input";
import { RetroSettingsInput } from "./retro-settings-input";
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

type SettingsSectionId = "connection" | "source" | "retro" | "columns";

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
  const [openSections, setOpenSections] = useState<Record<SettingsSectionId, boolean>>({
    connection: false,
    source: false,
    retro: false,
    columns: false,
  });

  const handleFieldChange = (field: string, value: string | number) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const toggleSection = (section: SettingsSectionId) => {
    setOpenSections((sections) => ({
      ...sections,
      [section]: !sections[section],
    }));
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
      retroRepository: draft.retroRepository.trim(),
      retroBranch: draft.retroBranch.trim(),
      retroFolder: draft.retroFolder.trim(),
      retroFilenamePattern: draft.retroFilenamePattern.trim() || "{date}.md",
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
    <DialogContent className="max-w-[72rem] max-h-[85vh] overflow-y-auto sm:max-w-[72rem]">
      <DialogHeader>
        <DialogTitle className="font-heading">Settings</DialogTitle>
        <DialogDescription>
          Configure your Azure DevOps connection, optional GitHub review source, and board layout.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-4">
        <SettingsSection
          id="connection"
          title="Connection"
          icon={Link}
          open={openSections.connection}
          onToggle={() => toggleSection("connection")}
        >
          <ConnectionForm
            pat={draft.pat}
            org={draft.org}
            project={draft.project}
            team={draft.team}
            githubUsername={draft.githubUsername}
            githubRepository={draft.githubRepository}
            onChange={handleFieldChange}
          />
        </SettingsSection>

        <SettingsSection
          id="source"
          title="Source"
          icon={Filter}
          open={openSections.source}
          onToggle={() => toggleSection("source")}
        >
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
        </SettingsSection>

        <SettingsSection
          id="retro"
          title="Retro Prep"
          icon={FileText}
          open={openSections.retro}
          onToggle={() => toggleSection("retro")}
        >
          <RetroSettingsInput
            retroRepository={draft.retroRepository}
            retroBranch={draft.retroBranch}
            retroFolder={draft.retroFolder}
            retroFilenamePattern={draft.retroFilenamePattern}
            onChange={handleFieldChange as (field: string, value: string) => void}
          />
        </SettingsSection>

        <SettingsSection
          id="columns"
          title="Board Columns"
          icon={Columns3}
          open={openSections.columns}
          onToggle={() => toggleSection("columns")}
        >
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
        </SettingsSection>
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

function SettingsSection({
  id,
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  id: SettingsSectionId;
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = `settings-section-${id}`;

  return (
    <section className="overflow-hidden rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            id={contentId}
            aria-hidden={!open}
            inert={!open}
            className={`border-t px-4 py-4 transition-opacity duration-200 ease-out ${
              open ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
