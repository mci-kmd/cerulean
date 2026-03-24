import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, FilePlus2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdoClient } from "@/api/ado-client";
import { RetroMarkdownEditor } from "./retro-markdown-editor";
import {
  buildRetroFilePath,
  buildRetroFilename,
  buildRetroTemplatePath,
  findLatestRetroFile,
  formatRetroDate,
  normalizeRetroFolder,
  prepareRetroDraft,
} from "@/lib/retro-template";

interface RetroPrepViewProps {
  client: AdoClient;
  org: string;
  project: string;
  repositoryId: string;
  branchName: string;
  folder: string;
  filenamePattern: string;
  today?: Date;
  openWindow?: Window["open"];
}

function buildAdoFileEditUrl(
  org: string,
  project: string,
  repositoryName: string,
  path: string,
  branchName: string,
): string {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repositoryName)}`,
  );
  url.searchParams.set("path", path);
  url.searchParams.set("version", `GB${branchName.trim()}`);
  url.searchParams.set("_a", "edit");
  return url.toString();
}

function resolveRepositoryName(
  repositories: Array<{ id: string; name: string }>,
  repositoryId: string,
): string {
  const normalized = repositoryId.trim().toLowerCase();
  return (
    repositories.find(
      (repository) =>
        repository.id.trim().toLowerCase() === normalized ||
        repository.name.trim().toLowerCase() === normalized,
    )?.name ?? repositoryId
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isMissingRepositoryItemError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /(?:^|[\s:])404\b|not found/i.test(error.message);
}

export function RetroPrepView({
  client,
  org,
  project,
  repositoryId,
  branchName,
  folder,
  filenamePattern,
  today = new Date(),
  openWindow = window.open,
}: RetroPrepViewProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [templatePath, setTemplatePath] = useState("");
  const [previousRetroPath, setPreviousRetroPath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [repositoryName, setRepositoryName] = useState("");
  const [editorUrl, setEditorUrl] = useState("");
  const [seededFollowUpTitles, setSeededFollowUpTitles] = useState<string[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasPrepared, setHasPrepared] = useState(false);
  const [targetAlreadyExists, setTargetAlreadyExists] = useState(false);

  const trimmedRepositoryId = repositoryId.trim();
  const trimmedBranchName = branchName.trim();
  const trimmedFilenamePattern = filenamePattern.trim();
  const normalizedFolder = normalizeRetroFolder(folder);
  const isConfigured = !!trimmedRepositoryId && !!trimmedBranchName && !!trimmedFilenamePattern;
  const formattedDate = formatRetroDate(today);

  const prepareDraftFromTemplate = useCallback(async () => {
    if (!isConfigured) {
      setError("Configure Retro Repository, Retro Branch, and Retro Filename Pattern first.");
      return;
    }

    setIsPreparing(true);
    setError("");
    try {
      const repositories = await client.listRepositories();
      const resolvedRepositoryName = resolveRepositoryName(repositories, trimmedRepositoryId);
      const items = await client.listRepositoryItems(
        trimmedRepositoryId,
        normalizedFolder,
        trimmedBranchName,
      );
      const nextPath = buildRetroFilePath(
        normalizedFolder,
        buildRetroFilename(trimmedFilenamePattern, today),
      );
      const existingTarget = items.find(
        (item) => !item.isFolder && item.path.toLowerCase() === nextPath.toLowerCase(),
      );
      if (existingTarget) {
        const existingDraft = await client.getRepositoryItemText(
          trimmedRepositoryId,
          nextPath,
          trimmedBranchName,
        );
        setDraft(existingDraft);
        setTemplatePath("");
        setPreviousRetroPath("");
        setTargetPath(nextPath);
        setRepositoryName(resolvedRepositoryName);
        setEditorUrl(
          buildAdoFileEditUrl(org, project, resolvedRepositoryName, nextPath, trimmedBranchName),
        );
        setSeededFollowUpTitles([]);
        setTargetAlreadyExists(true);
        setHasPrepared(true);
        toast.message("Loaded existing retro draft", {
          description: nextPath,
        });
        return;
      }

      const primaryTemplatePath = buildRetroTemplatePath(normalizedFolder);
      const templateCandidates =
        normalizedFolder && primaryTemplatePath !== "/Template.md"
          ? [primaryTemplatePath, "/Template.md"]
          : [primaryTemplatePath];
      let resolvedTemplatePath = "";
      let templateMarkdown = "";
      let lastTemplateError: unknown = null;

      for (const candidatePath of templateCandidates) {
        try {
          templateMarkdown = await client.getRepositoryItemText(
            trimmedRepositoryId,
            candidatePath,
            trimmedBranchName,
          );
          resolvedTemplatePath = candidatePath;
          break;
        } catch (caughtError) {
          lastTemplateError = caughtError;
          if (!isMissingRepositoryItemError(caughtError)) {
            throw caughtError;
          }
        }
      }

      if (!resolvedTemplatePath || !templateMarkdown) {
        if (lastTemplateError instanceof Error) {
          throw new Error(
            `Could not load Template.md from ${templateCandidates.join(" or ")}: ${lastTemplateError.message}`,
          );
        }
        throw new Error(`Could not load Template.md from ${templateCandidates.join(" or ")}.`);
      }

      const latestFile = findLatestRetroFile(
        items.filter(
          (item) => !item.isFolder && item.path.toLowerCase() !== resolvedTemplatePath.toLowerCase(),
        ),
        trimmedFilenamePattern,
      );
      const previousMarkdown = latestFile
        ? await client.getRepositoryItemText(trimmedRepositoryId, latestFile.path, trimmedBranchName)
        : "";
      const preparedDraft = prepareRetroDraft(templateMarkdown, previousMarkdown, today);
      setDraft(preparedDraft.content);
      setTemplatePath(resolvedTemplatePath);
      setPreviousRetroPath(latestFile?.path ?? "");
      setTargetPath(nextPath);
      setRepositoryName(resolvedRepositoryName);
      setEditorUrl(
        buildAdoFileEditUrl(org, project, resolvedRepositoryName, nextPath, trimmedBranchName),
      );
      setSeededFollowUpTitles(preparedDraft.seededFollowUpTitles);
      setTargetAlreadyExists(false);
      setHasPrepared(true);
    } catch (caughtError) {
      const message = formatError(caughtError);
      setError(message);
      toast.error("Failed to prepare retro draft", {
        description: message,
      });
    } finally {
      setIsPreparing(false);
    }
  }, [
    client,
    isConfigured,
    normalizedFolder,
    org,
    project,
    today,
    trimmedBranchName,
    trimmedFilenamePattern,
    trimmedRepositoryId,
  ]);

  async function handleCreateFile() {
    if (!targetPath || !draft.trim()) {
      setError("Prepare a draft before creating the repo file.");
      return;
    }
    if (targetAlreadyExists) {
      toast.message("Today's retro file already exists", {
        description: targetPath,
      });
      return;
    }

    setIsCreating(true);
    setError("");
    try {
      const push = await client.createRepositoryFile(
        trimmedRepositoryId,
        targetPath,
        draft,
        trimmedBranchName,
        `Create retro notes ${formattedDate}`,
      );
      const createdRepositoryName = push.repository?.name?.trim() || repositoryName || trimmedRepositoryId;
      const createdEditorUrl = buildAdoFileEditUrl(
        org,
        project,
        createdRepositoryName,
        targetPath,
        trimmedBranchName,
      );
      setRepositoryName(createdRepositoryName);
      setEditorUrl(createdEditorUrl);
      setTargetAlreadyExists(true);
      toast.success("Created retro file in Azure DevOps", {
        description: targetPath,
      });
    } catch (caughtError) {
      const message = formatError(caughtError);
      setError(message);
      toast.error("Failed to create retro file", {
        description: message,
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCopyMarkdown() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Copied retro markdown");
    } catch (caughtError) {
      toast.error("Failed to copy retro markdown", {
        description: formatError(caughtError),
      });
    }
  }

  function handleOpenInAdo() {
    if (!editorUrl) return;
    openWindow(editorUrl, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    if (!isConfigured || hasPrepared || isPreparing) return;
    void prepareDraftFromTemplate();
  }, [hasPrepared, isConfigured, isPreparing, prepareDraftFromTemplate]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {!isConfigured && (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Configure <strong>Retro Repository</strong>, <strong>Retro Branch</strong>, and <strong>Retro Filename Pattern</strong> in Settings to use Retro Prep.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void prepareDraftFromTemplate()}
          disabled={!isConfigured || isPreparing}
        >
          {isPreparing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Prepare draft
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleCreateFile()}
          disabled={!draft || isCreating || !targetPath}
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating
            </>
          ) : (
            <>
              <FilePlus2 className="h-4 w-4" />
              Create in ADO
            </>
          )}
        </Button>
        <Button variant="outline" onClick={() => void handleCopyMarkdown()} disabled={!draft}>
          <Copy className="h-4 w-4" />
          Copy markdown
        </Button>
        <Button variant="outline" onClick={handleOpenInAdo} disabled={!editorUrl}>
          <ExternalLink className="h-4 w-4" />
          Open in ADO
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="space-y-2">
          <RetroMarkdownEditor value={draft} onChange={setDraft} />
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-medium">Draft sources</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Template</dt>
                <dd className="break-all">
                  {templatePath ||
                    (targetAlreadyExists ? "Not used (loaded existing draft)" : "Not loaded yet")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Previous retro</dt>
                <dd className="break-all">
                  {previousRetroPath ||
                    (targetAlreadyExists ? "Not used (loaded existing draft)" : "None found")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target file</dt>
                <dd className="break-all">{targetPath || "Not prepared yet"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-medium">Seeded follow-up</h3>
            </div>
            {seededFollowUpTitles.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {seededFollowUpTitles.map((item) => (
                  <li key={item} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {targetAlreadyExists
                  ? "Loaded an existing draft for today."
                  : "No previous follow-up items found to seed yet."}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
