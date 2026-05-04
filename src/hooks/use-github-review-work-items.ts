import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchGithubReviewWorkItems,
  normalizeGithubReviewConfig,
} from "@/api/github-client";

const GITHUB_POLL_INTERVAL_MS = 10 * 60 * 1000;

export function useGithubReviewWorkItems(
  username: string,
  repository: string,
) {
  const normalized = useMemo(
    () => normalizeGithubReviewConfig({ username, repository }),
    [repository, username],
  );

  const query = useQuery({
    queryKey: ["github-review-work-items", normalized.username, normalized.repository],
    queryFn: () => fetchGithubReviewWorkItems(normalized.username, normalized.repository),
    enabled: !!normalized.username && !!normalized.repository,
    refetchInterval:
      normalized.username && normalized.repository
        ? GITHUB_POLL_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data?.workItems ?? [],
    newWorkIds: query.data?.newWorkIds ?? new Set<number>(),
    completedIds: query.data?.completedIds ?? new Set<number>(),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
