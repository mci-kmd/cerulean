import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import { fetchReviewWorkItems } from "@/api/work-items";

export function useReviewWorkItems(
  client: AdoClient | null,
  org: string,
  project: string,
  pollInterval: number,
  areaPath?: string,
  workItemTypes?: string,
) {
  const query = useQuery({
    queryKey: [
      "review-work-items",
      org,
      project,
      areaPath,
      workItemTypes,
    ],
    queryFn: () => fetchReviewWorkItems(client!, org, project, areaPath, workItemTypes),
    enabled: !!client && !!org && !!project,
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data?.workItems ?? [],
    newWorkIds: query.data?.newWorkIds ?? new Set<number>(),
    completedIds: query.data?.completedIds ?? new Set<number>(),
    isLoading: query.isLoading,
    error: query.error,
  };
}
