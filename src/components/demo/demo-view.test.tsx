import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { DemoView } from "./demo-view";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";
import { createAdoWorkItem } from "@/test/fixtures/work-items";

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
    http.get(`${BASE}/_apis/wit/workitems`, () => {
      return HttpResponse.json({ count: items.length, value: items });
    }),
  );
}

const defaultProps = {
  client: null as any,
  approvalState: "Resolved",
  closedState: "Closed",
  org: "test-org",
  project: "test-project",
};

describe("DemoView", () => {
  // Use real HttpAdoClient for MSW tests
  beforeAll(async () => {
    const { HttpAdoClient } = await import("@/api/ado-client");
    defaultProps.client = new HttpAdoClient({
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
    renderWithProviders(<DemoView {...defaultProps} />);
    // Should show spinner (svg with animate-spin)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows empty state when no items", async () => {
    setupHandlers([]);
    renderWithProviders(<DemoView {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(/No items in "Resolved" state/),
      ).toBeInTheDocument();
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

    renderWithProviders(<DemoView {...defaultProps} />);

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
          "System.Description": "<p>Bug details</p>",
        },
      }),
    ]);

    renderWithProviders(<DemoView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Clickable Item")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Clickable Item"));

    await waitFor(() => {
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Bug details")).toBeInTheDocument();
    });
  });
});
