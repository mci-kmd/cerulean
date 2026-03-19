import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";

interface ReturnParams {
  workItemId: number;
  targetState: string;
  targetBoardColumnField?: string;
  targetBoardColumnName?: string;
  targetBoardDoneField?: string;
}

export function useReturnToCandidate(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      targetState,
      targetBoardColumnField,
      targetBoardColumnName,
      targetBoardDoneField,
    }: ReturnParams) => {
      if (!client) throw new Error("No ADO client");
      return client.returnWorkItemToCandidate(
        workItemId,
        targetState,
        targetBoardColumnField,
        targetBoardColumnName,
        targetBoardDoneField,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["completed-work-items"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
  });
}
