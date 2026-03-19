import { useQuery } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import type { AdoClient } from "@/api/ado-client";
import type { WorkItem } from "@/types/board";
import type { CandidateBoardConfig } from "@/lib/ado-board";
import { fetchWorkItemsInitial, fetchWorkItemsDelta, type FetchResult } from "@/api/work-items";

export function useWorkItems(
  client: AdoClient | null,
  _sourceState: string,
  org: string,
  project: string,
  pollInterval: number,
  areaPath?: string,
  workItemTypes?: string,
  _sourceBoardColumn?: string,
  boardConfig?: CandidateBoardConfig,
) {
  const revMapRef = useRef<Map<number, { rev: number }>>(new Map());
  const cachedItemsRef = useRef<WorkItem[]>([]);
  const initializedRef = useRef(false);

  const fetchFn = useCallback(async (): Promise<FetchResult> => {
    if (!client) return { workItems: [], revMap: new Map() };

    let result: FetchResult;
    if (!initializedRef.current) {
      result = await fetchWorkItemsInitial(
        client,
        "",
        org,
        project,
        areaPath,
        workItemTypes,
        _sourceBoardColumn,
        boardConfig,
      );
      initializedRef.current = true;
    } else {
      result = await fetchWorkItemsDelta(
        client,
        "",
        org,
        project,
        revMapRef.current,
        cachedItemsRef.current,
        areaPath,
        workItemTypes,
        _sourceBoardColumn,
        boardConfig,
      );
    }

    revMapRef.current = result.revMap;
    cachedItemsRef.current = result.workItems;
    return result;
  }, [client, org, project, _sourceBoardColumn, areaPath, workItemTypes, boardConfig]);

  const query = useQuery({
    queryKey: [
      "work-items",
      org,
      project,
      _sourceState,
      _sourceBoardColumn ?? "",
      candidateBoardKey(boardConfig),
      areaPath,
      workItemTypes,
    ],
    queryFn: fetchFn,
    enabled:
      !!client &&
      ((!!boardConfig && !!_sourceBoardColumn) || !!_sourceState),
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data?.workItems ?? [],
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

function candidateBoardKey(boardConfig?: CandidateBoardConfig): string {
  if (!boardConfig) return "";
  return [
    boardConfig.boardId,
    boardConfig.columnFieldReferenceName,
    boardConfig.doneFieldReferenceName ?? "",
  ].join(":");
}
