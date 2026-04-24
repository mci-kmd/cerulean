import { createElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  GitPullRequestArrow,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Image as ImageIcon,
  MessageCircle,
  Pencil,
  Rocket,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
import { toast } from "sonner";
import { useBoardCollections } from "@/db/use-board-collections";
import { CopyableId } from "@/components/copyable-id";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getTypeStyle,
  getTypeIcon,
  CUSTOM_TASK_TYPE,
  UI_REVIEW_ICON,
  UI_REVIEW_STYLE,
} from "@/lib/work-item-types";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import { useSettings } from "@/hooks/use-board";
import { createAdoClient } from "@/api/ado-client";
import { openAdoPullRequestCreate } from "@/lib/ado-pr-create";
import { TaskDialog } from "./task-dialog";
import {
  COMPLETED_COLUMN_ID,
  NEW_WORK_COLUMN_ID,
  isReviewWorkItem,
  isUiReviewWorkItem,
  type PullRequestMergedBuildSummary,
  type PullRequestMergedReleaseSummary,
  type RelatedPullRequest,
  type WorkItem,
} from "@/types/board";

interface BoardCardProps {
  workItem: WorkItem;
  assignmentId: string;
  statusMessage?: string;
  mockupUrl?: string;
  discussionUrl?: string;
  candidateOptOut?: boolean;
  index: number;
  columnId: string;
}

type UiReviewLinkEditor = "mockup" | "discussion";

function resizeTextareaHeight(editor: HTMLTextAreaElement | null) {
  if (!editor) return;
  editor.style.height = "0px";
  editor.style.height = `${editor.scrollHeight}px`;
}

function isPullRequestCompleted(pr: RelatedPullRequest): boolean {
  if (pr.isCompleted !== undefined) return pr.isCompleted;
  return pr.status?.trim().toLowerCase() === "completed";
}

function isPullRequestAbandoned(pr: RelatedPullRequest): boolean {
  return pr.status?.trim().toLowerCase() === "abandoned";
}

function getPullRequestTitle(pr: RelatedPullRequest): string {
  return pr.title?.trim() || pr.label.trim() || "Pull Request";
}

function getRequiredReviewerTooltip(pr: RelatedPullRequest): string {
  const pendingCount = pr.requiredReviewersPendingCount;
  return typeof pendingCount === "number" && pendingCount > 0
    ? `Waiting for ${pendingCount} required reviewer${pendingCount === 1 ? "" : "s"} approval`
    : "Waiting for required reviewer approval";
}

function getMergedBuildSummaryClassName(pr: RelatedPullRequest): string {
  const summary = pr.mergedBuildSummary;
  if (!summary || summary.totalCount <= 0) {
    return "text-muted-foreground";
  }
  if (summary.failedCount > 0) {
    return "text-red-600";
  }
  if (summary.completedCount >= summary.totalCount) {
    return "text-green-600";
  }
  return "text-amber-600";
}

function formatMergedBuildPipelineName(pipeline: string): string {
  return pipeline.startsWith("KMD.Identity.") ? pipeline.slice("KMD.Identity.".length) : pipeline;
}

function getMergedBuildSummaryTooltip(summary: PullRequestMergedBuildSummary): string | null {
  if (summary.builds.length === 0) {
    return null;
  }
  return summary.builds
    .map((build) => `${formatMergedBuildPipelineName(build.pipeline)} - ${build.buildId}: ${build.status}`)
    .join("\n");
}

function getMergedReleaseSummaryClassName(pr: RelatedPullRequest): string {
  const summary = pr.mergedReleaseSummary;
  if (!summary || summary.totalCount <= 0) {
    return "text-muted-foreground";
  }
  if (summary.inProgressCount > 0) {
    return "text-amber-600";
  }
  if (summary.deployedCount > 0) {
    return "text-green-600";
  }
  return "text-muted-foreground";
}

function getMergedReleaseSummaryTooltip(summary: PullRequestMergedReleaseSummary): string | null {
  if (summary.releases.length === 0) {
    return null;
  }
  return summary.releases
    .map(
      (release) =>
        `${formatMergedBuildPipelineName(release.pipeline)} - ${release.buildId}: ${release.status}`,
    )
    .join("\n");
}

function getPullRequestStatusMetadata(pr: RelatedPullRequest): {
  icon: LucideIcon;
  iconVariant:
    | "default"
    | "mergeable"
    | "review-gate"
    | "conflict"
    | "build-error"
    | "completed";
  iconClassName: string;
  tooltip: string;
} {
  const mergeStatus = pr.mergeStatus?.trim().toLowerCase();
  const hasPendingRequiredReviewers = pr.requiredReviewersApproved === false;
  const hasMergeConflicts = mergeStatus === "conflicts";
  const hasPolicyOrBuildFailure = mergeStatus === "rejectedbypolicy";
  const hasMergeFailure = mergeStatus === "failure";
  const failingStatusChecks = pr.failingStatusChecks ?? [];
  const hasFailingStatusChecks = failingStatusChecks.length > 0;

  if (isPullRequestCompleted(pr)) {
    return {
      icon: GitPullRequest,
      iconVariant: "completed",
      iconClassName: "text-muted-foreground",
      tooltip: "Pull request completed",
    };
  }

  if (hasMergeConflicts || hasPolicyOrBuildFailure || hasMergeFailure || hasFailingStatusChecks) {
    const statusMessages: string[] = [];
    if (hasMergeConflicts) statusMessages.push("Cannot merge: merge conflicts");
    if (hasPolicyOrBuildFailure) {
      statusMessages.push("Cannot merge: build or policy checks failed");
    }
    if (hasMergeFailure) statusMessages.push("Cannot merge: merge failed");
    if (hasFailingStatusChecks) {
      statusMessages.push("Failing required checks:");
      statusMessages.push(...failingStatusChecks);
    }
    if (hasPendingRequiredReviewers) statusMessages.push(getRequiredReviewerTooltip(pr));
    return {
      icon: hasMergeConflicts ? GitPullRequestClosed : GitPullRequestDraft,
      iconVariant: hasMergeConflicts ? "conflict" : "build-error",
      iconClassName: "text-red-600",
      tooltip: statusMessages.join("\n"),
    };
  }

  if (mergeStatus === "succeeded" && pr.requiredReviewersApproved === true) {
    return {
      icon: GitPullRequest,
      iconVariant: "mergeable",
      iconClassName: "text-green-600",
      tooltip: "Mergeable",
    };
  }
  if (hasPendingRequiredReviewers) {
    return {
      icon: GitPullRequestDraft,
      iconVariant: "review-gate",
      iconClassName: "text-amber-600",
      tooltip: getRequiredReviewerTooltip(pr),
    };
  }
  if (mergeStatus === "succeeded") {
    return {
      icon: GitPullRequestDraft,
      iconVariant: "review-gate",
      iconClassName: "text-muted-foreground",
      tooltip: "Mergeability unknown: reviewer approvals unavailable",
    };
  }
  if (typeof pr.status === "string" && pr.status.trim().length > 0) {
    return {
      icon: GitPullRequest,
      iconVariant: "default",
      iconClassName: "text-muted-foreground",
      tooltip: `Status: ${pr.status.trim()}`,
    };
  }
  return {
    icon: GitPullRequest,
    iconVariant: "default",
    iconClassName: "text-muted-foreground",
    tooltip: "Status unavailable",
  };
}

function shouldShowPullRequestBuildStatus(columnId: string): boolean {
  return columnId !== NEW_WORK_COLUMN_ID && columnId !== COMPLETED_COLUMN_ID;
}

export function BoardCard({
  workItem,
  assignmentId,
  statusMessage,
  mockupUrl,
  discussionUrl,
  candidateOptOut,
  index,
  columnId,
}: BoardCardProps) {
  const { ref, isDragSource } = useSortable({
    id: assignmentId,
    index,
    group: columnId,
    data: { workItemId: workItem.id, columnId },
    feedback: "move",
  });

  const { assignments, customTasks } = useBoardCollections();
  const settings = useSettings();
  const [statusValue, setStatusValue] = useState(statusMessage ?? "");
  const [mockupUrlValue, setMockupUrlValue] = useState(mockupUrl ?? "");
  const [discussionUrlValue, setDiscussionUrlValue] = useState(discussionUrl ?? "");
  const [editOpen, setEditOpen] = useState(false);
  const [uiReviewLinkEditor, setUiReviewLinkEditor] = useState<UiReviewLinkEditor | null>(null);
  const statusRef = useRef<HTMLTextAreaElement | null>(null);
  const mockupUrlRef = useRef<HTMLInputElement | null>(null);
  const discussionUrlRef = useRef<HTMLInputElement | null>(null);

  const isReviewCard = isReviewWorkItem(workItem);
  const isUiReviewCard = isUiReviewWorkItem(workItem);
  const isCustomTask = workItem.type === CUSTOM_TASK_TYPE && !workItem.url;
  const isNativeAdoCard = !isReviewCard && !isUiReviewCard && !isCustomTask;
  const isTaskLikeCard = isCustomTask || isUiReviewCard;
  const displayId = workItem.displayId ?? workItem.id;
  const isUserStoryCard = workItem.type === "User Story";
  const relatedPullRequests = !isTaskLikeCard
    ? (workItem.relatedPullRequests ?? []).filter(
        (pr) => !isUserStoryCard || !isPullRequestAbandoned(pr),
      )
    : [];
  const isGithubReviewCard = isReviewCard && workItem.review.provider === "github";
  const canCreateAdoPullRequest =
    !isTaskLikeCard &&
    !isGithubReviewCard &&
    !!settings?.pat &&
    !!settings?.org &&
    !!settings?.project &&
    displayId > 0;
  const sortedPullRequests = [...relatedPullRequests].sort(
    (a, b) => Number(isPullRequestCompleted(a)) - Number(isPullRequestCompleted(b)),
  );
  const showPullRequestBuildStatus = shouldShowPullRequestBuildStatus(columnId);
  const showCandidateOptOutToggle = columnId === NEW_WORK_COLUMN_ID && isNativeAdoCard;
  const hideCandidateDetails = showCandidateOptOutToggle && candidateOptOut === true;
  const CandidateToggleIcon = hideCandidateDetails ? EyeOff : Eye;
  const showStatusEditor = columnId !== COMPLETED_COLUMN_ID && !hideCandidateDetails;
  const showUiReviewLinks = isUiReviewCard && showStatusEditor;
  const trimmedMockupUrl = mockupUrlValue.trim();
  const trimmedDiscussionUrl = discussionUrlValue.trim();

  const saveStatus = () => {
    const trimmed = statusValue.trim();
    if (trimmed !== (statusMessage ?? "")) {
      scheduleDndMutation(() => {
        if (!assignments.get(assignmentId)) return;
        assignments.update(assignmentId, (draft) => {
          draft.statusMessage = trimmed || undefined;
        });
      });
    }
  };

  const saveUiReviewLink = (link: UiReviewLinkEditor) => {
    const isMockupLink = link === "mockup";
    const trimmed = isMockupLink ? mockupUrlValue.trim() : discussionUrlValue.trim();
    const currentValue = isMockupLink ? (mockupUrl ?? "") : (discussionUrl ?? "");
    if (trimmed !== currentValue) {
      scheduleDndMutation(() => {
        if (!assignments.get(assignmentId)) return;
        assignments.update(assignmentId, (draft) => {
          if (isMockupLink) {
            draft.mockupUrl = trimmed || undefined;
            return;
          }
          draft.discussionUrl = trimmed || undefined;
        });
      });
    }
    setUiReviewLinkEditor((current) => (current === link ? null : current));
  };

  const toggleCandidateOptOut = () => {
    scheduleDndMutation(() => {
      if (!assignments.get(assignmentId)) return;
      assignments.update(assignmentId, (draft) => {
        draft.candidateOptOut = candidateOptOut ? undefined : true;
      });
    });
  };

  const handleEditSave = (newTitle: string) => {
    const taskId = findCustomTaskId(workItem.id);
    if (taskId && customTasks.get(taskId)) {
      customTasks.update(taskId, (draft) => {
        draft.title = newTitle;
      });
    }
  };

  const handleDelete = () => {
    const taskId = findCustomTaskId(workItem.id);
    if (taskId) {
      customTasks.delete([taskId]);
      assignments.delete([assignmentId]);
    }
  };

  function findCustomTaskId(workItemId: number): string | null {
    const found = customTasks.toArray.find((t) => t.workItemId === workItemId);
    return found?.id ?? null;
  }

  useLayoutEffect(() => {
    if (!showStatusEditor) return;
    resizeTextareaHeight(statusRef.current);
  }, [showStatusEditor, statusValue]);

  useEffect(() => {
    if (!showStatusEditor) return;

    const editor = statusRef.current;
    if (!editor) return;

    let frameId: number | null = null;
    if (typeof globalThis.requestAnimationFrame === "function") {
      frameId = globalThis.requestAnimationFrame(() => {
        resizeTextareaHeight(editor);
      });
    }

    if (typeof ResizeObserver !== "function") {
      return () => {
        if (frameId !== null && typeof globalThis.cancelAnimationFrame === "function") {
          globalThis.cancelAnimationFrame(frameId);
        }
      };
    }

    let lastWidth = editor.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (typeof nextWidth !== "number" || nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      resizeTextareaHeight(editor);
    });
    observer.observe(editor);

    return () => {
      if (frameId !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [showStatusEditor]);

  useEffect(() => {
    const editor =
      uiReviewLinkEditor === "mockup"
        ? mockupUrlRef.current
        : uiReviewLinkEditor === "discussion"
          ? discussionUrlRef.current
          : null;
    if (!editor) return;
    editor.focus();
    editor.select();
  }, [uiReviewLinkEditor]);

  const style = isUiReviewCard ? UI_REVIEW_STYLE : getTypeStyle(workItem.type);
  const typeIcon = isUiReviewCard ? UI_REVIEW_ICON : getTypeIcon(workItem.type);
  const reviewSurfaceStyle = isReviewCard
    ? {
        backgroundImage: `repeating-linear-gradient(45deg, transparent 0px, transparent 12px, ${style.stripe} 12px, ${style.stripe} 24px)`,
      }
    : undefined;
  const surfaceClassName = isReviewCard
    ? `${style.bg} transition-[filter] group-hover/card:brightness-[0.985]`
    : isUiReviewCard
      ? "bg-card transition-[background-color] group-hover/card:bg-accent/30"
      : "bg-card transition-[background-color] group-hover/card:bg-accent/30";

  const handleCreatePullRequest = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!canCreateAdoPullRequest || !settings) return;

    try {
      const client = createAdoClient({
        pat: settings.pat,
        org: settings.org,
        project: settings.project,
      });
      const result = await openAdoPullRequestCreate({
        client,
        org: settings.org,
        project: settings.project,
        workItemId: displayId,
        clipboard: navigator.clipboard,
        prompt: window.prompt.bind(window),
        open: window.open.bind(window),
      });
      if (result.status === "no-match") {
        toast.error("No matching ADO branch found", {
          description: `Couldn't find a branch starting with ${displayId}.`,
        });
      }
    } catch (error) {
      toast.error("Failed to open ADO PR page", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const renderUiReviewLink = ({
    kind,
    label,
    url,
    value,
    placeholder,
    inputRef,
    icon: Icon,
    onChange,
  }: {
    kind: UiReviewLinkEditor;
    label: string;
    url: string;
    value: string;
    placeholder: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    icon: LucideIcon;
    onChange: (value: string) => void;
  }) => {
    const isEditing = uiReviewLinkEditor === kind;
    const buttonLabel = `${url.length > 0 ? "Edit" : "Set"} ${label.toLowerCase()} URL`;

    return (
      <div className={`group/${kind} flex min-w-0 flex-1 items-center gap-1.5`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => saveUiReviewLink(kind)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs leading-snug text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        ) : url.length > 0 ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </a>
        ) : (
          <span className="min-w-0 truncate text-muted-foreground/60">{label}</span>
        )}
        {!isEditing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setUiReviewLinkEditor(kind);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-[color,opacity] hover:text-foreground group-hover/${kind}:opacity-100 group-focus-within/${kind}:opacity-100 focus-visible:opacity-100`}
            aria-label={buttonLabel}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        ref={ref}
        data-testid="board-card"
        className={`group/card relative rounded-lg cursor-grab active:cursor-grabbing ${
          isDragSource ? "opacity-50 scale-[0.97]" : ""
        }`}
      >
        <div
          data-testid="board-card-surface"
          aria-hidden="true"
          style={reviewSurfaceStyle}
          className={`pointer-events-none absolute inset-x-0 top-0 -bottom-px rounded-lg border-l-[3px] border border-border shadow-sm ${surfaceClassName} ${style.border}`}
        />
        <div className="relative z-10 p-3">
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
            {createElement(typeIcon, {
              className: `h-3.5 w-3.5 shrink-0 ${style.text}`,
            })}
            {showCandidateOptOutToggle && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCandidateOptOut();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`shrink-0 rounded p-0.5 transition-colors ${
                      hideCandidateDetails
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/card:opacity-100"
                    }`}
                    aria-label={
                      hideCandidateDetails
                        ? "Show full candidate details"
                        : "Don't expect to work on this item"
                    }
                    aria-pressed={hideCandidateDetails}
                    data-testid="candidate-opt-out-toggle"
                  >
                    <CandidateToggleIcon data-testid="candidate-opt-out-icon" className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {hideCandidateDetails
                    ? "Show full candidate details"
                    : "Don't expect to work on this item"}
                </TooltipContent>
              </Tooltip>
            )}
            {isReviewCard && (
              <span
                data-testid="review-label"
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.2em] ${style.badge}`}
              >
                REVIEW
              </span>
            )}
            {hideCandidateDetails ? (
              <a
                data-testid="board-card-title"
                href={workItem.url}
                target="_blank"
                rel="noopener noreferrer"
                title={workItem.title}
                className="min-w-0 flex-1 truncate text-sm font-medium leading-snug hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {workItem.title}
              </a>
            ) : (
              <span className="flex-1" />
            )}
            {!hideCandidateDetails &&
              (isCustomTask ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditOpen(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/card:opacity-100"
                  aria-label="Edit task"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  {canCreateAdoPullRequest && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleCreatePullRequest}
                         onPointerDown={(e) => e.stopPropagation()}
                         className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                         aria-label={`Create pull request for work item ${displayId}`}
                       >
                          <GitPullRequestArrow className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Create ADO pull request</TooltipContent>
                    </Tooltip>
                  )}
                  <CopyableId id={displayId} className="text-[10px]" />
                </div>
              ))}
          </div>
          {!hideCandidateDetails && isCustomTask ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="mb-2 block w-full text-left text-sm font-medium leading-snug hover:underline"
              title={workItem.title}
            >
              {workItem.title}
            </button>
          ) : !hideCandidateDetails ? (
            <a
              data-testid="board-card-title"
              href={workItem.url}
              target="_blank"
              rel="noopener noreferrer"
              title={workItem.title}
              className="mb-2 block text-sm font-medium leading-snug hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {workItem.title}
            </a>
          ) : null}
          {!hideCandidateDetails && sortedPullRequests.length > 0 && (
            <ul className="mb-2 space-y-0.5">
              {sortedPullRequests.map((pr) => {
                const isCompleted = isPullRequestCompleted(pr);
                const metadata = showPullRequestBuildStatus
                  ? getPullRequestStatusMetadata(pr)
                  : null;
                const Icon = metadata?.icon;
                const mergedBuildSummary =
                  showPullRequestBuildStatus &&
                  !isReviewCard &&
                  pr.mergedBuildSummary &&
                  pr.mergedBuildSummary.totalCount > 0
                    ? pr.mergedBuildSummary
                    : null;
                const mergedBuildTooltip = mergedBuildSummary
                  ? getMergedBuildSummaryTooltip(mergedBuildSummary)
                  : null;
                const mergedReleaseSummary =
                  showPullRequestBuildStatus &&
                  !isReviewCard &&
                  pr.mergedReleaseSummary &&
                  pr.mergedReleaseSummary.totalCount > 0
                    ? pr.mergedReleaseSummary
                    : null;
                const mergedReleaseTooltip = mergedReleaseSummary
                  ? getMergedReleaseSummaryTooltip(mergedReleaseSummary)
                  : null;
                const mergedBuildIndicator = mergedBuildSummary ? (
                  <span
                    data-testid={`pr-merged-build-summary-${pr.id}`}
                    className={`inline-flex items-center gap-0.5 ${getMergedBuildSummaryClassName(pr)}`}
                    aria-label={`Build pipelines ${mergedBuildSummary.completedCount} of ${mergedBuildSummary.totalCount} completed`}
                  >
                    <Workflow
                      data-testid={`pr-merged-build-icon-${pr.id}`}
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    <span>
                      {mergedBuildSummary.completedCount}/{mergedBuildSummary.totalCount}
                    </span>
                  </span>
                ) : null;
                const mergedReleaseIndicator = mergedReleaseSummary ? (
                  <span
                    data-testid={`pr-merged-release-summary-${pr.id}`}
                    className={`inline-flex items-center gap-0.5 ${getMergedReleaseSummaryClassName(pr)}`}
                    aria-label={`Release deployments ${mergedReleaseSummary.deployedCount} of ${mergedReleaseSummary.totalCount} deployed${mergedReleaseSummary.inProgressCount > 0 ? `, ${mergedReleaseSummary.inProgressCount} in progress` : ""}`}
                  >
                    <Rocket
                      data-testid={`pr-merged-release-icon-${pr.id}`}
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    <span>
                      {mergedReleaseSummary.deployedCount}/{mergedReleaseSummary.totalCount}
                    </span>
                  </span>
                ) : null;
                return (
                  <li key={pr.url}>
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      {metadata && Icon && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="mt-0.5 inline-flex shrink-0">
                              <Icon
                                data-testid={`pr-status-icon-${pr.id}`}
                                data-pr-icon-variant={metadata.iconVariant}
                                className={`h-3 w-3 ${metadata.iconClassName}`}
                                aria-hidden="true"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="whitespace-pre-line">
                            {metadata.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span
                        className={`inline-flex min-w-0 flex-wrap items-center gap-1 ${isCompleted ? "opacity-60" : ""}`}
                      >
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getPullRequestTitle(pr)}
                        </a>
                        {isCompleted && (
                          <span role="img" aria-label="Completed" className="inline-flex shrink-0">
                            <Check className="h-3 w-3" aria-hidden="true" />
                          </span>
                        )}
                        {mergedBuildIndicator &&
                          (mergedBuildTooltip ? (
                            <Tooltip>
                              <TooltipTrigger asChild>{mergedBuildIndicator}</TooltipTrigger>
                              <TooltipContent className="whitespace-pre-line">
                                {mergedBuildTooltip}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            mergedBuildIndicator
                          ))}
                        {mergedReleaseIndicator &&
                          (mergedReleaseTooltip ? (
                            <Tooltip>
                              <TooltipTrigger asChild>{mergedReleaseIndicator}</TooltipTrigger>
                              <TooltipContent className="whitespace-pre-line">
                                {mergedReleaseTooltip}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            mergedReleaseIndicator
                          ))}
                        {!isCompleted && (pr.unresolvedCommentCount ?? 0) > 0 && (
                          <span
                            data-testid={`pr-unresolved-comments-${pr.id}`}
                            className="inline-flex items-center gap-0.5"
                            aria-hidden="true"
                          >
                            <MessageCircle className="h-3 w-3" />
                            <span>{pr.unresolvedCommentCount}</span>
                          </span>
                        )}
                        {!isCompleted && isReviewCard && (pr.reviewerCount ?? 0) > 0 && (
                          <span
                            data-testid={`pr-reviewer-count-${pr.id}`}
                            className="inline-flex items-center gap-0.5"
                            aria-hidden="true"
                          >
                            <User className="h-3 w-3" />
                            <span>{pr.reviewerCount}</span>
                          </span>
                        )}
                        {!isCompleted && !isReviewCard && (pr.approvalCount ?? 0) > 0 && (
                          <span
                            data-testid={`pr-approval-count-${pr.id}`}
                            className="inline-flex items-center gap-0.5"
                            aria-hidden="true"
                          >
                            <User className="h-3 w-3" />
                            <span>{pr.approvalCount}</span>
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {showUiReviewLinks && (
            <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
              {renderUiReviewLink({
                kind: "mockup",
                label: "Mockup",
                url: trimmedMockupUrl,
                value: mockupUrlValue,
                placeholder: "Set mockup URL...",
                inputRef: mockupUrlRef,
                icon: ImageIcon,
                onChange: setMockupUrlValue,
              })}
              {renderUiReviewLink({
                kind: "discussion",
                label: "Discussion",
                url: trimmedDiscussionUrl,
                value: discussionUrlValue,
                placeholder: "Set discussion URL...",
                inputRef: discussionUrlRef,
                icon: MessageCircle,
                onChange: setDiscussionUrlValue,
              })}
            </div>
          )}
          {showStatusEditor && (
            <div className="flex items-center gap-2">
              <textarea
                ref={statusRef}
                rows={1}
                wrap="soft"
                value={statusValue}
                placeholder="Set status..."
                onChange={(e) => setStatusValue(e.target.value)}
                onBlur={saveStatus}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full resize-none overflow-hidden text-xs text-muted-foreground bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 leading-snug placeholder:text-muted-foreground/40"
              />
            </div>
          )}
        </div>
      </div>
      {isCustomTask && (
        <TaskDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          onSave={handleEditSave}
          onDelete={handleDelete}
          initialTitle={workItem.title}
          mode="edit"
        />
      )}
    </>
  );
}
