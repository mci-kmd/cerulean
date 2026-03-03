import { useQuery } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import type { AdoClient } from "@/api/ado-client";
import type { WorkItem } from "@/types/board";
import { fetchWorkItemsInitial, fetchWorkItemsDelta, type FetchResult } from "@/api/work-items";

export function useWorkItems(
  client: AdoClient | null,
  sourceState: string,
  org: string,
  project: string,
  pollInterval: number,
) {
  const revMapRef = useRef<Map<number, { rev: number }>>(new Map());
  const cachedItemsRef = useRef<WorkItem[]>([]);
  const initializedRef = useRef(false);

  const fetchFn = useCallback(async (): Promise<FetchResult> => {
    if (!client) return { workItems: [], revMap: new Map() };

    let result: FetchResult;
    if (!initializedRef.current) {
      result = await fetchWorkItemsInitial(client, sourceState, org, project);
      initializedRef.current = true;
    } else {
      result = await fetchWorkItemsDelta(
        client,
        sourceState,
        org,
        project,
        revMapRef.current,
        cachedItemsRef.current,
      );
    }

    revMapRef.current = result.revMap;
    cachedItemsRef.current = result.workItems;
    return result;
  }, [client, sourceState, org, project]);

  const query = useQuery({
    queryKey: ["work-items", org, project, sourceState],
    queryFn: fetchFn,
    enabled: !!client && !!sourceState,
    refetchInterval: pollInterval * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    workItems: query.data?.workItems ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
