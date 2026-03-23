import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAdoClient } from "@/api/ado-client.mock";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { useAssignedBoardWorkItems } from "./use-assigned-board-work-items";

describe("useAssignedBoardWorkItems", () => {
  let client: MockAdoClient;
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    client = new MockAdoClient();
    client.wiqlResult = {
      workItems: [
        { id: 1, url: "" },
        { id: 2, url: "" },
      ],
    };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Source item",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.Rev": 1,
          "WEF_FAKE_Kanban.Column": "In Progress",
        },
      }),
      createAdoWorkItem({
        id: 2,
        fields: {
          "System.Id": 2,
          "System.Title": "Completed item",
          "System.WorkItemType": "Bug",
          "System.State": "Resolved",
          "System.Rev": 1,
          "WEF_FAKE_Kanban.Column": "Approved",
        },
      }),
    ];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it("loads assigned board columns once and splits results by column", async () => {
    const { result } = renderHook(
      () =>
        useAssignedBoardWorkItems(
          client,
          "org",
          "proj",
          30,
          undefined,
          "Bug",
          "In Progress",
          "Approved",
          {
            team: "My Team",
            boardId: "board-1",
            boardName: "Stories",
            intakeColumnName: "Incoming",
            intakeColumnIsSplit: false,
            columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
            intakeStateMappings: {},
            boardColumnsByName: {
              "in progress": { isSplit: false, stateMappings: { Bug: "Active" } },
              approved: { isSplit: false, stateMappings: { Bug: "Resolved" } },
            },
          },
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.workItems).toHaveLength(1));
    expect(result.current.completedWorkItems).toHaveLength(1);
    expect(result.current.workItems[0]?.id).toBe(1);
    expect(result.current.completedWorkItems[0]?.id).toBe(2);

    const wiqlCalls = client.callLog.filter((call) => call.method === "queryWorkItems");
    const batchCalls = client.callLog.filter((call) => call.method === "batchGetWorkItems");
    expect(wiqlCalls).toHaveLength(1);
    expect(batchCalls).toHaveLength(1);

    const wiql = String(wiqlCalls[0]?.args[0] ?? "");
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'In Progress'");
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'Approved'");
    expect(wiql).toContain("[System.AssignedTo] = @Me");
  });
});
