import type { WorkItem } from "@/types/board";
import { createSyntheticNegativeId } from "@/lib/create-synthetic-id";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_ACCEPT = "application/vnd.github+json";
const GITHUB_MAX_PAGE_SIZE = 100;
const GITHUB_MAX_PAGES = 5;

interface GithubUser {
  login?: string;
}

interface GithubPullRequest {
  number: number;
  title?: string;
  html_url?: string;
  state?: string;
  draft?: boolean;
  user?: GithubUser;
  assignees?: GithubUser[];
  requested_reviewers?: GithubUser[];
}

interface GithubPullRequestReview {
  user?: GithubUser;
  state?: string;
  submitted_at?: string;
}

export interface GithubReviewConfig {
  username: string;
  repository: string;
}

export interface GithubReviewWorkItemsResult {
  workItems: WorkItem[];
  newWorkIds: Set<number>;
  completedIds: Set<number>;
}

type GithubReviewState = "new" | "active" | "completed";

function normalizeGithubUsername(username: string): string {
  return username.trim().replace(/^@+/, "");
}

function normalizeGithubRepository(repository: string): string {
  const trimmed = repository.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() === "github.com") {
        const [owner, repo] = url.pathname
          .replace(/^\/+|\/+$/g, "")
          .split("/")
          .filter(Boolean);
        if (owner && repo) {
          return `${owner}/${repo.replace(/\.git$/i, "")}`;
        }
      }
    } catch {
      return trimmed;
    }
  }

  const [owner, repo] = trimmed
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (owner && repo) {
    return `${owner}/${repo.replace(/\.git$/i, "")}`;
  }

  return trimmed;
}

export function normalizeGithubReviewConfig(config: GithubReviewConfig): GithubReviewConfig {
  return {
    ...config,
    username: normalizeGithubUsername(config.username),
    repository: normalizeGithubRepository(config.repository),
  };
}

function parseGithubRepository(repository: string): { owner: string; repo: string } {
  const normalizedRepository = normalizeGithubRepository(repository);
  const [owner, repo] = normalizedRepository.split("/");

  if (!owner || !repo) {
    throw new Error('GitHub repository must be in "owner/repo" format.');
  }

  return { owner, repo };
}

function matchesGithubUser(login: string | undefined, username: string): boolean {
  return login?.trim().toLowerCase() === username.trim().toLowerCase();
}

function isAssignedToGithubUser(pr: GithubPullRequest, username: string): boolean {
  const assignees = pr.assignees ?? [];
  const requestedReviewers = pr.requested_reviewers ?? [];

  return (
    assignees.some((assignee) => matchesGithubUser(assignee.login, username)) ||
    requestedReviewers.some((reviewer) => matchesGithubUser(reviewer.login, username))
  );
}

function getGithubReviewState(
  reviews: GithubPullRequestReview[],
  username: string,
): GithubReviewState {
  const latestReview = reviews
    .filter((review) => matchesGithubUser(review.user?.login, username))
    .sort((a, b) => {
      const left = a.submitted_at ? Date.parse(a.submitted_at) : 0;
      const right = b.submitted_at ? Date.parse(b.submitted_at) : 0;
      return right - left;
    })[0];

  const state = latestReview?.state?.trim().toUpperCase();
  if (state === "APPROVED") return "completed";
  if (state && state !== "PENDING") return "active";
  return "new";
}

function hasGithubReviewActivity(
  reviews: GithubPullRequestReview[],
  username: string,
): boolean {
  return reviews.some((review) => matchesGithubUser(review.user?.login, username));
}

async function githubFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers: {
      Accept: GITHUB_API_ACCEPT,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function listOpenPullRequests(owner: string, repo: string): Promise<GithubPullRequest[]> {
  const pullRequests: GithubPullRequest[] = [];

  for (let page = 1; page <= GITHUB_MAX_PAGES; page += 1) {
    const pageResults = await githubFetch<GithubPullRequest[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=${GITHUB_MAX_PAGE_SIZE}&page=${page}`,
    );
    pullRequests.push(...pageResults);
    if (pageResults.length < GITHUB_MAX_PAGE_SIZE) {
      break;
    }
  }

  return pullRequests;
}

async function listPullRequestReviews(
  owner: string,
  repo: string,
  pullRequestNumber: number,
): Promise<GithubPullRequestReview[]> {
  return githubFetch<GithubPullRequestReview[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/reviews?per_page=${GITHUB_MAX_PAGE_SIZE}`,
  );
}

function createGithubReviewWorkItemId(repository: string, pullRequestNumber: number): number {
  return createSyntheticNegativeId(`github:${repository}:${pullRequestNumber}`);
}

export async function fetchGithubReviewWorkItems(
  username: string,
  repository: string,
): Promise<GithubReviewWorkItemsResult> {
  const normalized = normalizeGithubReviewConfig({ username, repository });
  if (!normalized.username || !normalized.repository) {
    return { workItems: [], newWorkIds: new Set(), completedIds: new Set() };
  }

  const { owner, repo } = parseGithubRepository(normalized.repository);
  const pullRequests = await listOpenPullRequests(owner, repo);
  const eligiblePullRequests = pullRequests.filter(
    (pr) =>
      pr.draft !== true &&
      !matchesGithubUser(pr.user?.login, normalized.username),
  );

  if (eligiblePullRequests.length === 0) {
    return { workItems: [], newWorkIds: new Set(), completedIds: new Set() };
  }

  const reviewsByPullRequestNumber = new Map(
    await Promise.all(
      eligiblePullRequests.map(async (pr) => [
        pr.number,
        await listPullRequestReviews(owner, repo, pr.number),
      ] as const),
    ),
  );

  const workItems: WorkItem[] = [];
  const newWorkIds = new Set<number>();
  const completedIds = new Set<number>();

  for (const pr of eligiblePullRequests) {
    const reviews = reviewsByPullRequestNumber.get(pr.number) ?? [];
    const reviewState = getGithubReviewState(
      reviews,
      normalized.username,
    );
    const includePullRequest =
      isAssignedToGithubUser(pr, normalized.username) ||
      hasGithubReviewActivity(reviews, normalized.username);

    if (!includePullRequest) {
      continue;
    }

    const workItemId = createGithubReviewWorkItemId(normalized.repository, pr.number);

    workItems.push({
      id: workItemId,
      displayId: pr.number,
      title: pr.title?.trim() || `PR #${pr.number}`,
      type: "Pull Request",
      state: pr.state?.trim() || "open",
      rev: 1,
      url: pr.html_url?.trim() || `https://github.com/${owner}/${repo}/pull/${pr.number}`,
      kind: "review",
      review: {
        provider: "github",
        repositoryId: normalized.repository,
        pullRequestId: pr.number,
        reviewState,
      },
    });

    if (reviewState === "new") {
      newWorkIds.add(workItemId);
    } else if (reviewState === "completed") {
      completedIds.add(workItemId);
    }
  }

  return { workItems, newWorkIds, completedIds };
}
