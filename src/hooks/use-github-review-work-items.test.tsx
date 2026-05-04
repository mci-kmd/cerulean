import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { normalizeGithubReviewConfig } from "@/api/github-client";
import { useGithubReviewWorkItems } from "./use-github-review-work-items";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/github-client", () => ({
  fetchGithubReviewWorkItems: vi.fn(),
  normalizeGithubReviewConfig: vi.fn(
    ({ username, repository }: { username: string; repository: string }) => ({
      username,
      repository,
    }),
  ),
}));

describe("useGithubReviewWorkItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it("polls public GitHub data every ten minutes", () => {
    renderHook(() => useGithubReviewWorkItems("octocat", "octo-org/widgets"));

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["github-review-work-items", "octocat", "octo-org/widgets"],
        enabled: true,
        refetchInterval: 600_000,
        refetchIntervalInBackground: false,
      }),
    );
  });

  it("disables polling when GitHub config is empty", () => {
    vi.mocked(normalizeGithubReviewConfig).mockReturnValue({
      username: "",
      repository: "",
    });

    renderHook(() => useGithubReviewWorkItems("", ""));

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        refetchInterval: false,
      }),
    );
  });
});
