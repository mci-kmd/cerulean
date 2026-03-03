import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAdoClient } from "@/api/ado-client.mock";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { useCandidates } from "./use-candidates";

describe("useCandidates", () => {
  let client: MockAdoClient;
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [createAdoWorkItem({ id: 1 })];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it("fetches when enabled", async () => {
    const { result } = renderHook(
      () => useCandidates(client, "New", "org", "proj", true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.candidates).toHaveLength(1));
    expect(result.current.candidates[0].id).toBe(1);
  });

  it("skips when disabled", async () => {
    const { result } = renderHook(
      () => useCandidates(client, "New", "org", "proj", false),
      { wrapper },
    );

    // Should stay empty — query never fires
    expect(result.current.candidates).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("skips when candidateState is empty", async () => {
    const { result } = renderHook(
      () => useCandidates(client, "", "org", "proj", true),
      { wrapper },
    );

    expect(result.current.candidates).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });
});
