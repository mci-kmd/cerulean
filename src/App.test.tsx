import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { App } from "./App";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";
import { createAdoWorkItem } from "@/test/fixtures/work-items";

const BASE = "https://dev.azure.com/test-org/test-project";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("App integration", () => {
  it("shows empty state when no settings", () => {
    renderWithProviders(<App />);
    expect(screen.getByText("Configure Connection")).toBeInTheDocument();
  });

  it("shows empty state when settings but no columns", async () => {
    const { collections } = renderWithProviders(<App />);

    // Insert settings
    collections.settings.insert({
      id: "settings",
      pat: "test",
      org: "test-org",
      project: "test-project",
      team: "",
      sourceState: "Active",
      pollInterval: 30,
    } as any);

    await waitFor(() => {
      expect(screen.getByText("Set Up Columns")).toBeInTheDocument();
    });
  });

  it("renders board when settings and columns configured", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({
          workItems: [{ id: 1, url: "" }],
        });
      }),
      http.get(`${BASE}/_apis/wit/workitems`, () => {
        return HttpResponse.json({
          count: 1,
          value: [
            createAdoWorkItem({
              id: 1,
              fields: {
                "System.Id": 1,
                "System.Title": "My Task",
                "System.WorkItemType": "Task",
                "System.State": "Active",
                "System.Rev": 1,
              },
            }),
          ],
        });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert({
      id: "settings",
      pat: "test-pat",
      org: "test-org",
      project: "test-project",
      team: "",
      sourceState: "Active",
      pollInterval: 60,
    } as any);

    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 } as any);
    collections.columns.insert({ id: "col-2", name: "Done", order: 1 } as any);

    await waitFor(
      () => {
        expect(screen.getByText("To Do")).toBeInTheDocument();
        expect(screen.getByText("Done")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(screen.getByText("My Task")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it("opens settings dialog from header", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByText("Open Settings"));

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByLabelText("Personal Access Token")).toBeInTheDocument();
    });
  });

  it("shows demo button when approvalState is configured", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert({
      id: "settings",
      pat: "test-pat",
      org: "test-org",
      project: "test-project",
      team: "",
      sourceState: "Active",
      approvalState: "Resolved",
      closedState: "Closed",
      pollInterval: 60,
    } as any);
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 } as any);

    await waitFor(() => {
      expect(screen.getByLabelText("Demo mode")).toBeInTheDocument();
    });
  });

  it("hides demo button when approvalState is empty", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert({
      id: "settings",
      pat: "test-pat",
      org: "test-org",
      project: "test-project",
      team: "",
      sourceState: "Active",
      approvalState: "",
      closedState: "",
      pollInterval: 60,
    } as any);
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 } as any);

    await waitFor(() => {
      expect(screen.getByText("To Do")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Demo mode")).not.toBeInTheDocument();
  });

  it("toggles demo mode view on button click", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert({
      id: "settings",
      pat: "test-pat",
      org: "test-org",
      project: "test-project",
      team: "",
      sourceState: "Active",
      approvalState: "Resolved",
      closedState: "Closed",
      pollInterval: 60,
    } as any);
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 } as any);

    await waitFor(() => {
      expect(screen.getByLabelText("Demo mode")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Demo mode"));

    await waitFor(() => {
      expect(
        screen.getByText(/No items in "Resolved" state/),
      ).toBeInTheDocument();
    });

    // Click again to exit
    await user.click(screen.getByLabelText("Demo mode"));

    await waitFor(() => {
      expect(
        screen.queryByText(/No items in "Resolved" state/),
      ).not.toBeInTheDocument();
    });
  });
});
