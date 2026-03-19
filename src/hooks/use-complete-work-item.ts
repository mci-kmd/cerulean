import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";

interface CompleteParams {
  workItemId: number;
  targetState: string;
  targetBoardColumnField?: string;
  targetBoardColumnName?: string;
  targetBoardDoneField?: string;
  targetBoardDoneValue?: boolean;
}

export function useCompleteWorkItem(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      targetState,
      targetBoardColumnField,
      targetBoardColumnName,
      targetBoardDoneField,
      targetBoardDoneValue,
    }: CompleteParams) => {
      if (!client) throw new Error("No ADO client");
      return client.updateWorkItemState(
        workItemId,
        targetState,
        targetBoardColumnField,
        targetBoardColumnName,
        targetBoardDoneField,
        targetBoardDoneValue,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["completed-work-items"] });
      queryClient.invalidateQueries({ queryKey: ["demo-work-items"] });
    },
  });
}
