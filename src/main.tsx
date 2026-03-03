import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardCollectionsProvider } from "@/db/provider";
import { collections } from "@/db/collections";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BoardCollectionsProvider collections={collections}>
        <App />
      </BoardCollectionsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
