import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import { fetchCandidateBoardConfig } from "@/api/board-config";

export function useCandidateBoardConfig(
  client: AdoClient | null,
  org: string,
  project: string,
  team: string,
  enabled: boolean,
  workItemTypes?: string,
  preferredColumnNames?: string[],
  intakeColumnName?: string,
) {
  const query = useQuery({
    queryKey: [
      "candidate-board-config",
      org,
      project,
      team,
      workItemTypes,
      preferredColumnNames?.join("|") ?? "",
      intakeColumnName ?? "",
    ],
    queryFn: () =>
      fetchCandidateBoardConfig(
        client!,
        team,
        workItemTypes,
        preferredColumnNames,
        intakeColumnName,
      ),
    enabled: enabled && !!client && !!team,
    staleTime: 5 * 60_000,
  });

  return {
    boardConfig: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
