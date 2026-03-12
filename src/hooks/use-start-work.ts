import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import type { WorkItem } from "@/types/board";

export function useStartWork(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      targetState,
    }: {
      workItemId: number;
      targetState: string;
      optimisticRemoveFromCandidates?: boolean;
    }) => {
      if (!client) throw new Error("No ADO client");
      return client.startWorkItem(workItemId, targetState);
    },
    onMutate: async ({
      workItemId,
      optimisticRemoveFromCandidates = true,
    }: {
      workItemId: number;
      targetState: string;
      optimisticRemoveFromCandidates?: boolean;
    }) => {
      if (!optimisticRemoveFromCandidates) {
        return { prev: undefined, removedOptimistically: false };
      }
      await queryClient.cancelQueries({ queryKey: ["candidates"] });
      const prev = queryClient.getQueryData<WorkItem[]>(["candidates"]);
      queryClient.setQueriesData<WorkItem[]>(
        { queryKey: ["candidates"] },
        (old) => old?.filter((w) => w.id !== workItemId),
      );
      return { prev, removedOptimistically: true };
    },
    onError: (_err, _vars, context) => {
      if (context?.removedOptimistically && context.prev) {
        queryClient.setQueriesData<WorkItem[]>(
          { queryKey: ["candidates"] },
          context.prev,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
    },
  });
}
