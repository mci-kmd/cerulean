import { type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardCollectionsProvider } from "@/db/provider";
import { createBoardCollections, type BoardCollections } from "@/db/create-collections";
import { createAppQueryClient } from "@/lib/query-client";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  collections?: BoardCollections;
  queryClient?: QueryClient;
}

export function createTestQueryClient() {
  return createAppQueryClient({
    queryRetry: false,
    mutationRetry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export function createTestCollections() {
  return createBoardCollections(true);
}

export function renderWithProviders(
  ui: ReactNode,
  options: CustomRenderOptions = {},
) {
  const {
    collections = createTestCollections(),
    queryClient = createTestQueryClient(),
    ...renderOptions
  } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BoardCollectionsProvider collections={collections}>
          <TooltipProvider>{children}</TooltipProvider>
        </BoardCollectionsProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    collections,
    queryClient,
  };
}
