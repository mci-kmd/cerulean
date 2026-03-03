import { useMutation } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";

interface ApproveParams {
  workItemId: number;
  targetState: string;
}

export function useDemoApprove(client: AdoClient | null) {
  return useMutation({
    mutationFn: async ({ workItemId, targetState }: ApproveParams) => {
      if (!client) throw new Error("No ADO client");
      return client.updateWorkItemState(workItemId, targetState);
    },
  });
}
