import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdoClient } from "@/api/ado-client";

export interface ReviewPullRequestParams {
  repositoryId: string;
  pullRequestId: number;
  action: "start-review" | "approve-review" | "clear-vote" | "remove-reviewer";
}

export function useReviewPullRequest(client: AdoClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      repositoryId,
      pullRequestId,
      action,
    }: ReviewPullRequestParams) => {
      if (!client) throw new Error("No ADO client");

      const pullRequestIdText = String(pullRequestId);
      switch (action) {
        case "start-review":
          return client.addCurrentUserAsPullRequestReviewer(repositoryId, pullRequestIdText);
        case "approve-review":
          return client.approvePullRequestAsCurrentUser(repositoryId, pullRequestIdText);
        case "clear-vote":
          return client.clearPullRequestReviewVote(repositoryId, pullRequestIdText);
        case "remove-reviewer":
          return client.removeCurrentUserAsPullRequestReviewer(repositoryId, pullRequestIdText);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-work-items"] });
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["completed-work-items"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
  });
}
