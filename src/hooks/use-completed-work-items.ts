import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import { fetchCompletedWorkItems } from "@/api/work-items";

export function useCompletedWorkItems(
  client: AdoClient | null,
  approvalState: string,
  org: string,
  project: string,
  pollInterval: number,
  areaPath?: string,
  workItemTypes?: string,
) {
  const query = useQuery({
    queryKey: ["completed-work-items", org, project, approvalState, areaPath, workItemTypes],
    queryFn: () => fetchCompletedWorkItems(client!, approvalState, org, project, areaPath, workItemTypes),
    enabled: !!client && !!approvalState,
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data ?? [],
    isSuccess: query.isSuccess,
  };
}
