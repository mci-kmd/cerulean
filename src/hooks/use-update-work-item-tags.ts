import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";

interface UpdateWorkItemTagsParams {
  workItemId: number;
  addTags?: string[];
  removeTags?: string[];
}

export function useUpdateWorkItemTags(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workItemId,
      addTags = [],
      removeTags = [],
    }: UpdateWorkItemTagsParams) => {
      if (!client) throw new Error("No ADO client");
      return client.updateWorkItemTags(workItemId, addTags, removeTags);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ui-review-work-items"] });
    },
  });
}
