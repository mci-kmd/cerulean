import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import { fetchCandidateWorkItems } from "@/api/work-items";

export function useCandidates(
  client: AdoClient | null,
  candidateState: string,
  org: string,
  project: string,
  enabled: boolean,
  areaPath?: string,
  workItemTypes?: string,
) {
  const query = useQuery({
    queryKey: ["candidates", org, project, candidateState, areaPath, workItemTypes],
    queryFn: () => fetchCandidateWorkItems(client!, candidateState, org, project, areaPath, workItemTypes),
    enabled: enabled && !!client && !!candidateState,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    candidates: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
