import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BoardCollectionsProvider } from "@/db/provider";
import { collections } from "@/db/collections";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { createAppQueryClient } from "@/lib/query-client";
import { App } from "./App";
import "./index.css";

const queryClient = createAppQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BoardCollectionsProvider collections={collections}>
          <App />
        </BoardCollectionsProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
