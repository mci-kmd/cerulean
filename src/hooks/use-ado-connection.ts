import { useMutation } from "@tanstack/react-query";
import { createAdoClient } from "@/api/ado-client";

export function useAdoConnection() {
  return useMutation({
    mutationFn: async (config: {
      pat: string;
      org: string;
      project: string;
    }) => {
      const client = createAdoClient(config);
      const ok = await client.testConnection();
      if (!ok) throw new Error("Connection failed");
      return true;
    },
  });
}
