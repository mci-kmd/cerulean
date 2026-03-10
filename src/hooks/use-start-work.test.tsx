import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAdoClient } from "@/api/ado-client.mock";
import { WorkItemAlreadyAssignedError } from "@/api/ado-client";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { useStartWork } from "./use-start-work";

describe("useStartWork", () => {
  let client: MockAdoClient;
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    client = new MockAdoClient();
    client.workItems = [
      createAdoWorkItem({
        id: 42,
        fields: {
          "System.Id": 42,
          "System.Title": "Work Item 42",
          "System.WorkItemType": "User Story",
          "System.State": "New",
          "System.AssignedTo": {
            displayName: "Me",
            uniqueName: "me@test.com",
          },
          "System.Rev": 1,
        },
      }),
    ];
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  it("calls startWorkItem on mutate", async () => {
    const { result } = renderHook(() => useStartWork(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = client.callLog.find((c) => c.method === "startWorkItem");
    expect(call).toBeDefined();
    expect(call?.args).toEqual([42, "Active"]);
  });

  it("invalidates queries on success", async () => {
    let invalidated = false;
    queryClient.setQueryData(["candidates", "org", "proj", "New"], []);
    const orig = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = async (opts) => {
      if (Array.isArray(opts?.queryKey) && opts.queryKey[0] === "work-items") {
        invalidated = true;
      }
      return orig(opts);
    };

    const { result } = renderHook(() => useStartWork(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated).toBe(true);
  });

  it("errors when work item is already assigned to someone else", async () => {
    client.workItems = [
      createAdoWorkItem({
        id: 42,
        fields: {
          "System.Id": 42,
          "System.Title": "Work Item 42",
          "System.WorkItemType": "User Story",
          "System.State": "New",
          "System.Rev": 1,
          "System.AssignedTo": {
            displayName: "Other Person",
            uniqueName: "other@example.com",
          },
        },
      }),
    ];

    const { result } = renderHook(() => useStartWork(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(WorkItemAlreadyAssignedError);
    expect(result.current.error?.message).toContain("Other Person");
  });

  it("succeeds when work item is assigned to current user", async () => {
    client.workItems = [
      createAdoWorkItem({
        id: 42,
        fields: {
          "System.Id": 42,
          "System.Title": "Work Item 42",
          "System.WorkItemType": "User Story",
          "System.State": "New",
          "System.Rev": 1,
          "System.AssignedTo": {
            displayName: "Me",
            uniqueName: "me@test.com",
          },
        },
      }),
    ];

    const { result } = renderHook(() => useStartWork(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("succeeds when work item is unassigned", async () => {
    client.workItems = [
      createAdoWorkItem({
        id: 42,
        fields: {
          "System.Id": 42,
          "System.Title": "Work Item 42",
          "System.WorkItemType": "User Story",
          "System.State": "New",
          "System.AssignedTo": undefined,
          "System.Rev": 1,
        },
      }),
    ];

    const { result } = renderHook(() => useStartWork(client), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("errors when client is null", async () => {
    const { result } = renderHook(() => useStartWork(null), { wrapper });

    act(() => {
      result.current.mutate({ workItemId: 42, targetState: "Active" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("No ADO client");
  });
});
