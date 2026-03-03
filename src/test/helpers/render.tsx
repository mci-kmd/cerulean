import { type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardCollectionsProvider } from "@/db/provider";
import { createBoardCollections, type BoardCollections } from "@/db/create-collections";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  collections?: BoardCollections;
  queryClient?: QueryClient;
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
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
