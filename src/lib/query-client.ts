import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { showAdoAuthToast } from "@/lib/ado-auth-toast";

interface AppQueryClientOptions {
  queryRetry?: number | false;
  mutationRetry?: number | false;
  staleTime?: number;
  gcTime?: number;
}

export function createAppQueryClient(options: AppQueryClientOptions = {}) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: showAdoAuthToast,
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        showAdoAuthToast(error);
      },
    }),
    defaultOptions: {
      queries: {
        retry: options.queryRetry ?? 1,
        staleTime: options.staleTime ?? 10_000,
        ...(options.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
      },
      mutations: {
        retry: options.mutationRetry ?? false,
      },
    },
  });
}
