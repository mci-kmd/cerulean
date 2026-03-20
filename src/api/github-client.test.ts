import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { fetchGithubReviewWorkItems, normalizeGithubReviewConfig } from "./github-client";

const GITHUB_REPO_API = "https://api.github.com/repos/octo-org/widgets";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("normalizeGithubReviewConfig", () => {
  it("normalizes username and repository url", () => {
    expect(
      normalizeGithubReviewConfig({
        username: " @octocat ",
        repository: " https://github.com/octo-org/widgets/ ",
      }),
    ).toEqual({
      username: "octocat",
      repository: "octo-org/widgets",
    });
  });
});

describe("fetchGithubReviewWorkItems", () => {
  it("creates GitHub review cards and buckets them by review state", async () => {
    server.use(
      http.get(`${GITHUB_REPO_API}/pulls`, () =>
        HttpResponse.json([
          {
            number: 12,
            title: "New review request",
            html_url: "https://github.com/octo-org/widgets/pull/12",
            state: "open",
            user: { login: "someone-else" },
            requested_reviewers: [{ login: "octocat" }],
            assignees: [],
          },
          {
            number: 13,
            title: "Already started",
            html_url: "https://github.com/octo-org/widgets/pull/13",
            state: "open",
            user: { login: "someone-else" },
            requested_reviewers: [],
            assignees: [{ login: "octocat" }],
          },
          {
            number: 14,
            title: "Approved already",
            html_url: "https://github.com/octo-org/widgets/pull/14",
            state: "open",
            user: { login: "someone-else" },
            requested_reviewers: [{ login: "octocat" }],
            assignees: [],
          },
          {
            number: 17,
            title: "Reviewed but no longer requested",
            html_url: "https://github.com/octo-org/widgets/pull/17",
            state: "open",
            user: { login: "someone-else" },
            requested_reviewers: [],
            assignees: [],
          },
          {
            number: 15,
            title: "My own PR",
            html_url: "https://github.com/octo-org/widgets/pull/15",
            state: "open",
            user: { login: "octocat" },
            requested_reviewers: [{ login: "octocat" }],
            assignees: [],
          },
          {
            number: 16,
            title: "Draft PR",
            html_url: "https://github.com/octo-org/widgets/pull/16",
            state: "open",
            user: { login: "someone-else" },
            draft: true,
            requested_reviewers: [{ login: "octocat" }],
            assignees: [],
          },
        ]),
      ),
      http.get(`${GITHUB_REPO_API}/pulls/12/reviews`, () => HttpResponse.json([])),
      http.get(`${GITHUB_REPO_API}/pulls/13/reviews`, () =>
        HttpResponse.json([
          {
            user: { login: "octocat" },
            state: "COMMENTED",
            submitted_at: "2026-03-20T08:30:00Z",
          },
        ]),
      ),
      http.get(`${GITHUB_REPO_API}/pulls/14/reviews`, () =>
        HttpResponse.json([
          {
            user: { login: "octocat" },
            state: "APPROVED",
            submitted_at: "2026-03-20T08:31:00Z",
          },
        ]),
      ),
      http.get(`${GITHUB_REPO_API}/pulls/15/reviews`, () => HttpResponse.json([])),
      http.get(`${GITHUB_REPO_API}/pulls/16/reviews`, () => HttpResponse.json([])),
      http.get(`${GITHUB_REPO_API}/pulls/17/reviews`, () =>
        HttpResponse.json([
          {
            user: { login: "octocat" },
            state: "APPROVED",
            submitted_at: "2026-03-20T08:35:00Z",
          },
        ]),
      ),
    );

    const result = await fetchGithubReviewWorkItems("octocat", "octo-org/widgets");

    expect(result.workItems).toHaveLength(4);
    expect(result.workItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayId: 12,
          title: "New review request",
          kind: "review",
          review: expect.objectContaining({
            provider: "github",
            repositoryId: "octo-org/widgets",
            pullRequestId: 12,
            reviewState: "new",
          }),
        }),
        expect.objectContaining({
          displayId: 13,
          review: expect.objectContaining({
            reviewState: "active",
          }),
        }),
        expect.objectContaining({
          displayId: 14,
          review: expect.objectContaining({
            reviewState: "completed",
          }),
        }),
        expect.objectContaining({
          displayId: 17,
          title: "Reviewed but no longer requested",
          review: expect.objectContaining({
            reviewState: "completed",
          }),
        }),
      ]),
    );

    const newReview = result.workItems.find((item) => item.displayId === 12);
    const completedReview = result.workItems.find((item) => item.displayId === 14);

    expect(result.newWorkIds.has(newReview!.id)).toBe(true);
    expect(result.completedIds.has(completedReview!.id)).toBe(true);
  });

  it("returns empty results when GitHub review config is missing", async () => {
    await expect(fetchGithubReviewWorkItems("", "")).resolves.toEqual({
      workItems: [],
      newWorkIds: new Set(),
      completedIds: new Set(),
    });
  });
});
