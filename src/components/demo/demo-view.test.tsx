import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { DemoView } from "./demo-view";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import type { AdoClient } from "@/api/ado-client";

vi.mock("nanoid", () => ({
  nanoid: (() => {
    let i = 0;
    return () => `dv-${++i}`;
  })(),
}));

const BASE = "https://dev.azure.com/test-org/test-project";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setupHandlers(items: ReturnType<typeof createAdoWorkItem>[]) {
  const ids = items.map((i) => i.id);
  server.use(
    http.post(`${BASE}/_apis/wit/wiql`, () => {
      return HttpResponse.json({
        workItems: ids.map((id) => ({ id, url: "" })),
      });
    }),
    http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
      return HttpResponse.json({ count: items.length, value: items });
    }),
    http.patch(`${BASE}/_apis/wit/workitems/:id`, ({ params }) => {
      const id = Number(params.id);
      const item = items.find((i) => i.id === id);
      return HttpResponse.json(item ?? { id });
    }),
  );
}

let client: AdoClient | null = null;

const defaultProps = {
  approvalBoardColumn: "Approved",
  boardConfig: {
    team: "test-project",
    boardId: "board-1",
    boardName: "Stories",
    intakeColumnName: "New",
    intakeColumnIsSplit: false,
    columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
    intakeStateMappings: {
      Bug: "New",
      "User Story": "New",
    },
    boardColumnsByName: {
      approved: {
        isSplit: false,
        stateMappings: {
          Bug: "Resolved",
          "User Story": "Resolved",
        },
      },
    },
  },
  closedState: "Closed",
  org: "test-org",
  project: "test-project",
};

describe("DemoView", () => {
  const getClient = (): AdoClient => {
    if (!client) throw new Error("Test client not initialized");
    return client;
  };

  // Use real HttpAdoClient for MSW tests
  beforeAll(async () => {
    const { HttpAdoClient } = await import("@/api/ado-client");
    client = new HttpAdoClient({
      pat: "test-pat",
      org: "test-org",
      project: "test-project",
    });
  });

  it("shows loading state", () => {
    setupHandlers([]);
    // Use a never-resolving handler
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return new Promise(() => {}); // never resolves
      }),
    );
    renderWithProviders(<DemoView client={getClient()} {...defaultProps} />);
    // Should show spinner (svg with animate-spin)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows empty state when no items", async () => {
    setupHandlers([]);
    renderWithProviders(<DemoView client={getClient()} {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/No items in "Approved" column/)).toBeInTheDocument();
    });
  });

  it("renders demo items", async () => {
    setupHandlers([
      createAdoWorkItem({
        id: 10,
        fields: {
          "System.Id": 10,
          "System.Title": "Feature X",
          "System.WorkItemType": "User Story",
          "System.State": "Resolved",
          "System.Rev": 1,
          "System.Description": "<p>Desc</p>",
          "Microsoft.VSTS.Common.AcceptanceCriteria": "<p>AC</p>",
        },
      }),
    ]);

    renderWithProviders(<DemoView client={getClient()} {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Feature X")).toBeInTheDocument();
    });
  });

  it("expands item on click", async () => {
    const user = userEvent.setup();
    setupHandlers([
      createAdoWorkItem({
        id: 20,
        fields: {
          "System.Id": 20,
          "System.Title": "Clickable Item",
          "System.WorkItemType": "Bug",
          "System.State": "Resolved",
          "System.Rev": 1,
          "Microsoft.VSTS.TCM.ReproSteps": "<p>Bug repro</p>",
        },
      }),
    ]);

    renderWithProviders(<DemoView client={getClient()} {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Clickable Item")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Clickable Item"));

    await waitFor(() => {
      expect(screen.getByText("Repro Steps")).toBeInTheDocument();
      expect(screen.getByText("Bug repro")).toBeInTheDocument();
    });
  });

  it("closes last pending user story without crashing", async () => {
    const user = userEvent.setup();
    setupHandlers([
      createAdoWorkItem({
        id: 30,
        fields: {
          "System.Id": 30,
          "System.Title": "Close-safe story",
          "System.WorkItemType": "User Story",
          "System.State": "Resolved",
          "System.Rev": 1,
          "System.Description": "<p>Desc</p>",
          "Microsoft.VSTS.Common.AcceptanceCriteria": "<p>AC</p>",
        },
      }),
    ]);

    renderWithProviders(<DemoView client={getClient()} {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Close-safe story")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Close-safe story"));
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(
        screen.getByLabelText("Approved: Close-safe story"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Pending Review")).not.toBeInTheDocument();
    });
  });
});
