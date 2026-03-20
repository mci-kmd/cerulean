import { createElement, useEffect, useRef, useState } from "react";
import {
  GitPullRequestArrow,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageCircle,
  Pencil,
  User,
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
  isReviewWorkItem,
  isUiReviewWorkItem,
  type RelatedPullRequest,
  type WorkItem,
} from "@/types/board";

interface BoardCardProps {
  workItem: WorkItem;
  assignmentId: string;
  statusMessage?: string;
  mockupUrl?: string;
  index: number;
  columnId: string;
}

function isPullRequestCompleted(pr: RelatedPullRequest): boolean {
  if (pr.isCompleted !== undefined) return pr.isCompleted;
  return pr.status?.trim().toLowerCase() === "completed";
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
      statusMessages.push(`Failing required checks: ${failingStatusChecks.join(", ")}`);
    }
    if (hasPendingRequiredReviewers) statusMessages.push(getRequiredReviewerTooltip(pr));
    return {
      icon: hasMergeConflicts ? GitPullRequestClosed : GitPullRequestDraft,
      iconVariant: hasMergeConflicts ? "conflict" : "build-error",
      iconClassName: "text-red-600",
      tooltip: statusMessages.join(" | "),
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

export function BoardCard({
  workItem,
  assignmentId,
  statusMessage,
  mockupUrl,
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
  const [editOpen, setEditOpen] = useState(false);
  const [mockupUrlEditOpen, setMockupUrlEditOpen] = useState(false);
  const statusRef = useRef<HTMLTextAreaElement | null>(null);
  const mockupUrlRef = useRef<HTMLInputElement | null>(null);

  const isReviewCard = isReviewWorkItem(workItem);
  const isUiReviewCard = isUiReviewWorkItem(workItem);
  const isCustomTask = workItem.type === CUSTOM_TASK_TYPE && !workItem.url;
  const isTaskLikeCard = isCustomTask || isUiReviewCard;
  const displayId = workItem.displayId ?? workItem.id;
  const relatedPullRequests =
    isReviewCard || workItem.type === "Bug" || workItem.type === "User Story"
      ? workItem.relatedPullRequests ?? []
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
  const showStatusEditor = columnId !== COMPLETED_COLUMN_ID;
  const showMockupUrlEditor = isUiReviewCard && showStatusEditor;
  const trimmedMockupUrl = mockupUrlValue.trim();

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

  const saveMockupUrl = () => {
    const trimmed = mockupUrlValue.trim();
    if (trimmed !== (mockupUrl ?? "")) {
      scheduleDndMutation(() => {
        if (!assignments.get(assignmentId)) return;
        assignments.update(assignmentId, (draft) => {
          draft.mockupUrl = trimmed || undefined;
        });
      });
    }
    setMockupUrlEditOpen(false);
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

  useEffect(() => {
    const editor = statusRef.current;
    if (!editor) return;
    editor.style.height = "0px";
    editor.style.height = `${editor.scrollHeight}px`;
  }, [statusValue]);

  useEffect(() => {
    if (!mockupUrlEditOpen) return;
    const editor = mockupUrlRef.current;
    if (!editor) return;
    editor.focus();
    editor.select();
  }, [mockupUrlEditOpen]);

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
          <div className="flex items-center gap-1.5 mb-1.5">
            {createElement(typeIcon, {
              className: `h-3.5 w-3.5 shrink-0 ${style.text}`,
            })}
            {isReviewCard && (
              <span
                data-testid="review-label"
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.2em] ${style.badge}`}
              >
                REVIEW
              </span>
            )}
            <span className="flex-1" />
              {isCustomTask ? (
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
              ) : isUiReviewCard ? null : (
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
             )}
           </div>
          {isCustomTask ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="block text-left text-sm font-medium leading-snug hover:underline mb-2 w-full"
            >
              {workItem.title}
            </button>
          ) : (
            <a
              href={workItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-medium leading-snug hover:underline mb-2"
              onClick={(e) => e.stopPropagation()}
            >
              {workItem.title}
            </a>
          )}
          {sortedPullRequests.length > 0 && (
            <ul className="mb-2 space-y-0.5">
              {sortedPullRequests.map((pr) => {
                const isCompleted = isPullRequestCompleted(pr);
                const metadata = getPullRequestStatusMetadata(pr);
                const Icon = metadata.icon;
                return (
                  <li key={pr.url}>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-xs text-muted-foreground hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                        <TooltipContent>{metadata.tooltip}</TooltipContent>
                      </Tooltip>
                      <span className={`inline-flex items-center gap-1 ${isCompleted ? "opacity-60" : ""}`}>
                        {getPullRequestTitle(pr)}
                        {isCompleted ? " (Completed)" : ""}
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
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {showMockupUrlEditor && (
            <div className="group/mockup mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              {mockupUrlEditOpen ? (
                <input
                  ref={mockupUrlRef}
                  value={mockupUrlValue}
                  placeholder="Set mockup URL..."
                  onChange={(e) => setMockupUrlValue(e.target.value)}
                  onBlur={saveMockupUrl}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full min-w-0 text-xs text-muted-foreground bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 leading-snug placeholder:text-muted-foreground/40"
                />
              ) : trimmedMockupUrl.length > 0 ? (
                <>
                  <a
                    href={trimmedMockupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={trimmedMockupUrl}
                    className="min-w-0 flex-1 truncate hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {trimmedMockupUrl}
                  </a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMockupUrlEditOpen(true);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground opacity-0 transition-[color,opacity] hover:text-foreground group-hover/mockup:opacity-100 group-focus-within/mockup:opacity-100 focus-visible:opacity-100"
                    aria-label="Edit mockup URL"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 px-1 py-0.5 text-muted-foreground/40">
                    Set mockup URL...
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMockupUrlEditOpen(true);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground opacity-0 transition-[color,opacity] hover:text-foreground group-hover/mockup:opacity-100 group-focus-within/mockup:opacity-100 focus-visible:opacity-100"
                    aria-label="Set mockup URL"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </>
              )}
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
