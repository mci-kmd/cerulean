import { useQuery } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import type { DemoWorkItem } from "@/types/demo";
import { fetchDemoWorkItems } from "@/api/demo-work-items";

export function useDemoWorkItems(
  client: AdoClient | null,
  approvalState: string,
  org: string,
  project: string,
  enabled: boolean,
) {
  const query = useQuery<DemoWorkItem[]>({
    queryKey: ["demo-work-items", org, project, approvalState],
    queryFn: () => fetchDemoWorkItems(client!, approvalState, org, project),
    enabled: enabled && !!client && !!approvalState,
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
