import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";

interface CompleteParams {
  workItemId: number;
  targetState: string;
}

export function useCompleteWorkItem(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workItemId, targetState }: CompleteParams) => {
      if (!client) throw new Error("No ADO client");
      return client.updateWorkItemState(workItemId, targetState);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["completed-work-items"] });
      queryClient.invalidateQueries({ queryKey: ["demo-work-items"] });
    },
  });
}
