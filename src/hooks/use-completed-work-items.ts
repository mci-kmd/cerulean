import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import type { CandidateBoardConfig } from "@/lib/ado-board";
import { fetchCompletedWorkItems } from "@/api/work-items";

export function useCompletedWorkItems(
  client: AdoClient | null,
  _approvalState: string,
  org: string,
  project: string,
  pollInterval: number,
  areaPath?: string,
  workItemTypes?: string,
  approvalBoardColumn?: string,
  boardConfig?: CandidateBoardConfig,
) {
  const query = useQuery({
    queryKey: [
      "completed-work-items",
      org,
      project,
      _approvalState,
      approvalBoardColumn,
      boardKey(boardConfig),
      areaPath,
      workItemTypes,
    ],
    queryFn: () =>
      fetchCompletedWorkItems(
        client!,
        _approvalState,
        org,
        project,
        areaPath,
        workItemTypes,
        approvalBoardColumn,
        boardConfig,
      ),
    enabled: !!client && ((!!approvalBoardColumn && !!boardConfig) || !!_approvalState),
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data ?? [],
    isSuccess: query.isSuccess,
  };
}

function boardKey(boardConfig?: CandidateBoardConfig): string {
  if (!boardConfig) return "";
  return [
    boardConfig.boardId,
    boardConfig.columnFieldReferenceName,
    boardConfig.doneFieldReferenceName ?? "",
  ].join(":");
}
