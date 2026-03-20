import { describe, expect, it } from "vitest";
import { COMPLETED_COLUMN_ID, NEW_WORK_COLUMN_ID } from "@/constants/board-columns";
import { getGithubReviewPlacement } from "./github-review-placement";

function createGithubReviewWorkItem(
  id: number,
  reviewState: "new" | "active" | "completed",
) {
  return {
    id,
    displayId: Math.abs(id),
    title: `PR ${Math.abs(id)}`,
    type: "Pull Request",
    state: "open",
    rev: 1,
    url: `https://github.com/octo-org/widgets/pull/${Math.abs(id)}`,
    kind: "review" as const,
    review: {
      provider: "github" as const,
      repositoryId: "octo-org/widgets",
      pullRequestId: Math.abs(id),
      reviewState,
    },
  };
}

describe("getGithubReviewPlacement", () => {
  it("keeps a GitHub review card in Completed when it is already assigned there", () => {
    const result = getGithubReviewPlacement(
      [createGithubReviewWorkItem(-77, "new")],
      [
        {
          id: "a-1",
          workItemId: -77,
          columnId: COMPLETED_COLUMN_ID,
          position: 1,
        },
      ],
    );

    expect(result.completedIds.has(-77)).toBe(true);
    expect(result.candidateIds.has(-77)).toBe(false);
  });

  it("keeps a GitHub review card in New Work when it is already assigned there", () => {
    const result = getGithubReviewPlacement(
      [createGithubReviewWorkItem(-78, "active")],
      [
        {
          id: "a-2",
          workItemId: -78,
          columnId: NEW_WORK_COLUMN_ID,
          position: 1,
        },
      ],
    );

    expect(result.candidateIds.has(-78)).toBe(true);
    expect(result.completedIds.has(-78)).toBe(false);
  });

  it("falls back to review state when the GitHub review card is unassigned", () => {
    const result = getGithubReviewPlacement(
      [
        createGithubReviewWorkItem(-79, "new"),
        createGithubReviewWorkItem(-80, "completed"),
        createGithubReviewWorkItem(-81, "active"),
      ],
      [],
    );

    expect(result.candidateIds.has(-79)).toBe(true);
    expect(result.completedIds.has(-80)).toBe(true);
    expect(result.candidateIds.has(-81)).toBe(false);
    expect(result.completedIds.has(-81)).toBe(false);
  });

  it("does not force a GitHub review card into special columns when already in a local column", () => {
    const result = getGithubReviewPlacement(
      [createGithubReviewWorkItem(-82, "new")],
      [
        {
          id: "a-3",
          workItemId: -82,
          columnId: "col-doing",
          position: 1,
        },
      ],
    );

    expect(result.candidateIds.has(-82)).toBe(false);
    expect(result.completedIds.has(-82)).toBe(false);
  });
});
