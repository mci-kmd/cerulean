import { createElement, useEffect, useRef, useState } from "react";
import {
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageCircle,
  Pencil,
  User,
  type LucideIcon,
} from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useBoardCollections } from "@/db/use-board-collections";
import { CopyableId } from "@/components/copyable-id";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getTypeStyle, getTypeIcon, CUSTOM_TASK_TYPE } from "@/lib/work-item-types";
import { scheduleDndMutation } from "@/lib/schedule-dnd-mutation";
import { TaskDialog } from "./task-dialog";
import type { RelatedPullRequest, WorkItem } from "@/types/board";

interface BoardCardProps {
  workItem: WorkItem;
  assignmentId: string;
  statusMessage?: string;
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
  const [value, setValue] = useState(statusMessage ?? "");
  const [editOpen, setEditOpen] = useState(false);
  const statusRef = useRef<HTMLTextAreaElement | null>(null);

  const isCustomTask = workItem.type === CUSTOM_TASK_TYPE && !workItem.url;
  const relatedPullRequests =
    workItem.type === "Bug" || workItem.type === "User Story"
      ? workItem.relatedPullRequests ?? []
      : [];
  const sortedPullRequests = [...relatedPullRequests].sort(
    (a, b) => Number(isPullRequestCompleted(a)) - Number(isPullRequestCompleted(b)),
  );

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (statusMessage ?? "")) {
      scheduleDndMutation(() => {
        if (!assignments.get(assignmentId)) return;
        assignments.update(assignmentId, (draft) => {
          draft.statusMessage = trimmed || undefined;
        });
      });
    }
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
  }, [value]);

  const style = getTypeStyle(workItem.type);
  const typeIcon = getTypeIcon(workItem.type);

  return (
    <>
      <div
        ref={ref}
        className={`group/card rounded-lg border-l-[3px] border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all hover:-translate-y-px hover:shadow-md ${style.border} ${
          isDragSource ? "opacity-50 scale-[0.97]" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          {createElement(typeIcon, {
            className: `h-3.5 w-3.5 shrink-0 ${style.text}`,
          })}
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
          ) : (
            <CopyableId id={workItem.id} className="text-[10px]" />
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
                      {!isCompleted && (pr.approvalCount ?? 0) > 1 && (
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
        <div className="flex items-center gap-2">
          <textarea
            ref={statusRef}
            rows={1}
            wrap="soft"
            value={value}
            placeholder="Set status..."
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
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
