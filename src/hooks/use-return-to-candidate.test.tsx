import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAdoClient } from "@/api/ado-client.mock";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { useReturnToCandidate } from "./use-return-to-candidate";

describe("useReturnToCandidate", () => {
  let client: MockAdoClient;
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    client = new MockAdoClient();
    client.workItems = [createAdoWorkItem({ id: 42 })];
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  it("calls returnWorkItemToCandidate on mutate", async () => {
    const { result } = renderHook(() => useReturnToCandidate(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "New" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = client.callLog.find(
      (c) => c.method === "returnWorkItemToCandidate",
    );
    expect(call).toBeDefined();
    expect(call?.args).toEqual([42, "New", undefined, undefined, undefined]);
  });

  it("errors when client is null", async () => {
    const { result } = renderHook(() => useReturnToCandidate(null), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "New" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("No ADO client");
  });
});
