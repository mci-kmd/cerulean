import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAdoClient } from "@/api/ado-client.mock";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { useCompleteWorkItem } from "./use-complete-work-item";

describe("useCompleteWorkItem", () => {
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

  it("calls updateWorkItemState to complete", async () => {
    const { result } = renderHook(() => useCompleteWorkItem(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Resolved" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = client.callLog.find(
      (c) => c.method === "updateWorkItemState",
    );
    expect(call).toBeDefined();
    expect(call?.args).toEqual([42, "Resolved"]);
  });

  it("calls updateWorkItemState to uncomplete", async () => {
    const { result } = renderHook(() => useCompleteWorkItem(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = client.callLog.find(
      (c) => c.method === "updateWorkItemState",
    );
    expect(call?.args).toEqual([42, "Active"]);
  });

  it("errors when client is null", async () => {
    const { result } = renderHook(() => useCompleteWorkItem(null), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Resolved" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("No ADO client");
  });

  it("reports error on failure", async () => {
    client.shouldFail = true;
    const { result } = renderHook(() => useCompleteWorkItem(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Resolved" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
