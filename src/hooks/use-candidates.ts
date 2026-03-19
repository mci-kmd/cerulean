import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import { fetchCandidateWorkItems } from "@/api/work-items";
import type { CandidateBoardConfig } from "@/lib/ado-board";

export function useCandidates(
  client: AdoClient | null,
  _candidateState: string,
  org: string,
  project: string,
  enabled: boolean,
  areaPath?: string,
  workItemTypes?: string,
  _candidateStatesByType?: string,
  boardConfig?: CandidateBoardConfig,
) {
  const query = useQuery({
    queryKey: [
      "candidates",
      org,
      project,
      _candidateState,
      areaPath,
      workItemTypes,
      _candidateStatesByType,
      boardConfig?.boardId,
      boardConfig?.intakeColumnName,
    ],
    queryFn: () =>
      fetchCandidateWorkItems(
        client!,
        _candidateState,
        org,
        project,
        areaPath,
        workItemTypes,
        _candidateStatesByType,
        boardConfig,
      ),
    enabled:
      enabled &&
      !!client &&
      (boardConfig !== undefined || !!_candidateState || !!_candidateStatesByType),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    candidates: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
