import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import type { ColumnAssignment, WorkItem } from "@/types/board";

interface GithubReviewPlacement {
  candidateIds: Set<number>;
  completedIds: Set<number>;
}

export function getGithubReviewPlacement(
  githubReviewWorkItems: WorkItem[],
  assignments: ColumnAssignment[],
): GithubReviewPlacement {
  const githubReviewWorkItemIds = new Set(githubReviewWorkItems.map((item) => item.id));
  const assignedColumnByWorkItemId = new Map(
    assignments
      .filter((assignment) => githubReviewWorkItemIds.has(assignment.workItemId))
      .map((assignment) => [assignment.workItemId, assignment.columnId] as const),
  );

  const candidateIds = new Set<number>();
  const completedIds = new Set<number>();

  for (const workItem of githubReviewWorkItems) {
    const assignedColumnId = assignedColumnByWorkItemId.get(workItem.id);

    if (assignedColumnId === COMPLETED_COLUMN_ID) {
      completedIds.add(workItem.id);
      continue;
    }

    if (assignedColumnId === NEW_WORK_COLUMN_ID) {
      candidateIds.add(workItem.id);
      continue;
    }

    if (assignedColumnId) {
      continue;
    }

    if (workItem.review?.reviewState === "completed") {
      completedIds.add(workItem.id);
    } else if (workItem.review?.reviewState === "new") {
      candidateIds.add(workItem.id);
    }
  }

  return { candidateIds, completedIds };
}
