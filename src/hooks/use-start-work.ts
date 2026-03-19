import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";
import type { WorkItem } from "@/types/board";

interface StartWorkParams {
  workItemId: number;
  targetState: string;
  targetBoardColumnField?: string;
  targetBoardColumnName?: string;
  targetBoardDoneField?: string;
  targetBoardDoneValue?: boolean;
  optimisticRemoveFromCandidates?: boolean;
}

export function useStartWork(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      targetState,
      targetBoardColumnField,
      targetBoardColumnName,
      targetBoardDoneField,
      targetBoardDoneValue,
    }: StartWorkParams) => {
      if (!client) throw new Error("No ADO client");
      return client.startWorkItem(
        workItemId,
        targetState,
        targetBoardColumnField,
        targetBoardColumnName,
        targetBoardDoneField,
        targetBoardDoneValue,
      );
    },
    onMutate: async ({
      workItemId,
      optimisticRemoveFromCandidates = true,
    }: StartWorkParams) => {
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
