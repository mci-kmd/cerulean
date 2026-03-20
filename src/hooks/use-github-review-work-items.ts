import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchGithubReviewWorkItems,
  normalizeGithubReviewConfig,
} from "@/api/github-client";

const MIN_GITHUB_POLL_INTERVAL_SECONDS = 300;

export function useGithubReviewWorkItems(
  username: string,
  repository: string,
  pollInterval: number,
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
        ? Math.max(pollInterval, MIN_GITHUB_POLL_INTERVAL_SECONDS) * 1000
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
