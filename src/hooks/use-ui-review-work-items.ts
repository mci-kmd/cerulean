import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import { fetchUiReviewWorkItems } from "@/api/work-items";

export function useUiReviewWorkItems(
  client: AdoClient | null,
  org: string,
  project: string,
  pollInterval: number,
  uiReviewTag?: string,
  areaPath?: string,
  workItemTypes?: string,
) {
  const normalizedTag = uiReviewTag?.trim() ?? "";

  const query = useQuery({
    queryKey: [
      "ui-review-work-items",
      org,
      project,
      normalizedTag,
      areaPath,
      workItemTypes,
    ],
    queryFn: () =>
      fetchUiReviewWorkItems(
        client!,
        org,
        project,
        normalizedTag,
        areaPath,
        workItemTypes,
      ),
    enabled: !!client && !!org && !!project && normalizedTag.length > 0,
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
