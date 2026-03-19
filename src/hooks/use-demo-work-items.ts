import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import type { DemoWorkItem } from "@/types/demo";
import { fetchDemoWorkItems } from "@/api/demo-work-items";
import type { CandidateBoardConfig } from "@/lib/ado-board";

export function useDemoWorkItems(
  client: AdoClient | null,
  approvalBoardColumn: string,
  org: string,
  project: string,
  enabled: boolean,
  boardConfig?: CandidateBoardConfig,
) {
  const query = useQuery<DemoWorkItem[]>({
    queryKey: ["demo-work-items", org, project, approvalBoardColumn, boardConfig?.boardId],
    queryFn: () => fetchDemoWorkItems(client!, approvalBoardColumn, boardConfig!, org, project),
    enabled: enabled && !!client && !!approvalBoardColumn,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
