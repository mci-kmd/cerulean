import { toast } from "sonner";
import { getAdoErrorStatus } from "@/api/ado-client";

const ADO_AUTH_TOAST_ID = "ado-auth-permission-error";

export function showAdoAuthToast(error: unknown) {
  const status = getAdoErrorStatus(error);
  if (status !== 401 && status !== 403) {
    return;
  }

  toast.error(
    status === 401 ? "Azure DevOps authentication failed" : "Azure DevOps permission denied",
    {
      id: ADO_AUTH_TOAST_ID,
      description:
        status === 401
          ? "A request to Azure DevOps was rejected with 401. Check your PAT, org/project settings, and sign-in state."
          : "A request to Azure DevOps was rejected with 403. Check PAT scopes and your Azure DevOps permissions.",
    },
  );
}
