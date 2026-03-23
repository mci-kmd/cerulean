import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { AdoClient } from "@/api/ado-client";
import { fetchWorkItemsDelta, fetchWorkItemsInitial, type FetchResult } from "@/api/work-items";
import type { CandidateBoardConfig } from "@/lib/ado-board";
import type { WorkItem } from "@/types/board";

interface UseAssignedBoardWorkItemsResult {
  workItems: WorkItem[];
  completedWorkItems: WorkItem[];
  isLoading: boolean;
  isSuccess: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  dataUpdatedAt: number;
}

export function useAssignedBoardWorkItems(
  client: AdoClient | null,
  org: string,
  project: string,
  pollInterval: number,
  areaPath?: string,
  workItemTypes?: string,
  sourceBoardColumn?: string,
  approvalBoardColumn?: string,
  boardConfig?: CandidateBoardConfig,
): UseAssignedBoardWorkItemsResult {
  const revMapRef = useRef<Map<number, { rev: number }>>(new Map());
  const cachedItemsRef = useRef<WorkItem[]>([]);
  const initializedRef = useRef(false);
  const sourceColumn = sourceBoardColumn?.trim() ?? "";
  const approvalColumn = approvalBoardColumn?.trim() ?? "";
  const hasBoardColumns = sourceColumn.length > 0 || approvalColumn.length > 0;

  const fetchFn = useCallback(async (): Promise<FetchResult> => {
    if (!client) return { workItems: [], revMap: new Map() };
    const boardColumnNames = getBoardColumnNames(sourceColumn, approvalColumn);

    let result: FetchResult;
    if (!initializedRef.current) {
      result = await fetchWorkItemsInitial(
        client,
        "",
        org,
        project,
        areaPath,
        workItemTypes,
        boardConfig,
        boardColumnNames,
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
        boardConfig,
        boardColumnNames,
      );
    }

    revMapRef.current = result.revMap;
    cachedItemsRef.current = result.workItems;
    return result;
  }, [approvalColumn, areaPath, boardConfig, client, org, project, sourceColumn, workItemTypes]);

  const query = useQuery({
    queryKey: [
      "work-items",
      org,
      project,
      "assigned-board",
      sourceColumn,
      approvalColumn,
      boardKey(boardConfig),
      areaPath,
      workItemTypes,
    ],
    queryFn: fetchFn,
    enabled: !!client && !!boardConfig && hasBoardColumns,
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });
  const items = query.data?.workItems ?? [];

  return {
    workItems: items.filter(
      (item) => sourceColumn.length > 0 && normalizeColumnName(item.boardColumnName) === normalizeColumnName(sourceColumn),
    ),
    completedWorkItems: items.filter(
      (item) => approvalColumn.length > 0 && normalizeColumnName(item.boardColumnName) === normalizeColumnName(approvalColumn),
    ),
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
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

function normalizeColumnName(columnName?: string): string {
  return columnName?.trim().toLocaleLowerCase() ?? "";
}

function getBoardColumnNames(sourceColumn: string, approvalColumn: string): string[] {
  return [sourceColumn, approvalColumn].filter(
    (columnName, index, columns): columnName is string =>
      columnName.length > 0 && columns.indexOf(columnName) === index,
  );
}
