import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { App } from "./App";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { DEFAULT_SETTINGS, type AdoSettings } from "@/types/board";

const BASE = "https://dev.azure.com/test-org/test-project";

vi.mock("@/components/retro/retro-markdown-editor", () => ({
  RetroMarkdownEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="Draft markdown"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

function createSettings(overrides: Partial<AdoSettings> = {}): AdoSettings {
  return {
    ...DEFAULT_SETTINGS,
    pat: "test-pat",
    org: "test-org",
    project: "test-project",
    team: "test-project",
    sourceBoardColumn: "Committed",
    ...overrides,
  };
}

function installBoardHandlers() {
  server.use(
    http.get(`${BASE}/_apis/work/boards`, () =>
      HttpResponse.json({
        value: [
          {
            id: "board-1",
            name: "Stories",
            url: `${BASE}/_apis/work/boards/board-1`,
          },
        ],
      }),
    ),
    http.get(`${BASE}/_apis/work/boards/board-1`, () =>
      HttpResponse.json({
        id: "board-1",
        name: "Stories",
        url: `${BASE}/_apis/work/boards/board-1`,
        fields: {
          columnField: { referenceName: "WEF_FAKE_Kanban.Column" },
          doneField: { referenceName: "WEF_FAKE_Kanban.Column.Done" },
        },
        columns: [
          {
            id: "col-new",
            name: "New",
            columnType: "incoming",
            isSplit: false,
            stateMappings: { Task: "New", Bug: "New", "User Story": "New" },
          },
          {
            id: "col-todo",
            name: "Committed",
            isSplit: false,
            stateMappings: { Task: "Active", Bug: "Active", "User Story": "Active" },
          },
          {
            id: "col-approved",
            name: "Approved",
            isSplit: false,
            stateMappings: { Task: "Resolved", Bug: "Resolved", "User Story": "Resolved" },
          },
        ],
      }),
    ),
  );
}

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
    collections.settings.insert(
      createSettings({
        id: "settings",
        pat: "test",
        pollInterval: 30,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Set Up Columns")).toBeInTheDocument();
    });
  });

  it("renders board when settings and columns configured", async () => {
    installBoardHandlers();
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        const query = body.query ?? "";
        if (query.includes("[System.AssignedTo] = @Me") && query.includes("'Committed'")) {
          return HttpResponse.json({ workItems: [{ id: 1, url: "" }] });
        }
        return HttpResponse.json({ workItems: [] });
      }),
      http.post(`${BASE}/_apis/wit/workitemsbatch`, () =>
        HttpResponse.json({
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
                "WEF_FAKE_Kanban.Column": "Committed",
              },
            }),
          ],
        }),
      ),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        pollInterval: 60,
      }),
    );

    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });
    collections.columns.insert({ id: "col-2", name: "Done", order: 1 });

    await waitFor(
      () => {
        expect(screen.getByText("New Work")).toBeInTheDocument();
        expect(screen.getByText("To Do")).toBeInTheDocument();
        expect(screen.getByText("Done")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const newWorkHeading = screen.getByRole("heading", { name: "New Work" });
    const firstUserColumnHeading = screen.getByRole("heading", { name: "To Do" });
    expect(
      newWorkHeading.compareDocumentPosition(firstUserColumnHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(
      screen.getAllByRole("button", { name: /add task to/i }),
    ).toHaveLength(1);

  }, 10000);

  it("shows an auth toast when an Azure DevOps query fails with 403", async () => {
    installBoardHandlers();
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => new HttpResponse(null, { status: 403 })),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    expect(await screen.findByText("Azure DevOps permission denied")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "A request to Azure DevOps was rejected with 403. Check PAT scopes and your Azure DevOps permissions.",
      ),
    ).toBeInTheDocument();
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

  it("shows demo button when approval board column is configured", async () => {
    installBoardHandlers();
    server.use(http.post(`${BASE}/_apis/wit/wiql`, () => HttpResponse.json({ workItems: [] })));

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        approvalBoardColumn: "Approved",
        closedState: "Closed",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(screen.getByLabelText("Demo mode")).toBeInTheDocument();
    });
  });

  it("opens retro prep mode and prepares a draft", async () => {
    const user = userEvent.setup();
    installBoardHandlers();
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => HttpResponse.json({ workItems: [] })),
      http.get(`${BASE}/_apis/git/repositories`, () =>
        HttpResponse.json({
          value: [{ id: "repo-1", name: "Retro Repo", defaultBranch: "refs/heads/main" }],
        }),
      ),
      http.get(`${BASE}/_apis/git/repositories/repo-1/items`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("includeContent") === "true") {
          return HttpResponse.json({
            path: "/retros/2026-03-16.md",
            content: [
              "# Sprint retro 2026-03-16",
              "",
              "## Decisions",
              "- Keep the release checklist tighter",
              "",
              "## Went well",
              "- Team swarmed fast",
            ].join("\n"),
          });
        }
        return HttpResponse.json({
          value: [{ path: "/retros/2026-03-16.md", gitObjectType: "blob" }],
        });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        retroRepository: "repo-1",
        retroBranch: "main",
        retroFolder: "retros",
        retroFilenamePattern: "{date}.md",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retro prep" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Retro prep" }));

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Draft markdown") as HTMLTextAreaElement).value,
      ).toContain("# Sprint retro");
    });
    expect(screen.getByText("/retros/2026-03-16.md")).toBeInTheDocument();
  });

  it("queries candidate intake from the source board incoming column", async () => {
    const capturedQueries: string[] = [];

    server.use(
      http.get(`${BASE}/_apis/work/boards`, () => {
        return HttpResponse.json({
          value: [
            {
              id: "board-1",
              name: "Stories",
              url: `${BASE}/_apis/work/boards/board-1`,
            },
          ],
        });
      }),
      http.get(`${BASE}/_apis/work/boards/board-1`, () => {
        return HttpResponse.json({
          id: "board-1",
          name: "Stories",
          url: `${BASE}/_apis/work/boards/board-1`,
          columns: [
            {
              id: "col-new",
              name: "New",
              columnType: "incoming",
              stateMappings: { Bug: "New", "User Story": "New" },
            },
            {
              id: "col-approved",
              name: "Approved",
              stateMappings: { Bug: "Active", "User Story": "Committed" },
            },
          ],
          fields: {
            columnField: { referenceName: "WEF_FAKE_Kanban.Column" },
          },
        });
      }),
      http.post(`${BASE}/_apis/wit/wiql`, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body.query) capturedQueries.push(body.query);
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        team: "test-project",
        sourceBoardColumn: "Committed",
        workItemTypes: "Bug, User Story",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(capturedQueries.some((query) => query.includes("[System.AssignedTo] = ''"))).toBe(true);
    });

    expect(
      capturedQueries.some(
        (query) =>
          query.includes("[System.AssignedTo] = ''") &&
          query.includes("[WEF_FAKE_Kanban.Column] = 'New'"),
      ),
    ).toBe(true);
  });

  it("queries candidate intake from the configured new-work board column", async () => {
    const capturedQueries: string[] = [];

    server.use(
      http.get(`${BASE}/_apis/work/boards`, () =>
        HttpResponse.json({
          value: [
            {
              id: "board-1",
              name: "Stories",
              url: `${BASE}/_apis/work/boards/board-1`,
            },
          ],
        }),
      ),
      http.get(`${BASE}/_apis/work/boards/board-1`, () =>
        HttpResponse.json({
          id: "board-1",
          name: "Stories",
          url: `${BASE}/_apis/work/boards/board-1`,
          columns: [
            {
              id: "col-new",
              name: "New",
              columnType: "incoming",
              stateMappings: { Bug: "New", "User Story": "New" },
            },
            {
              id: "col-ideas",
              name: "Ideas",
              stateMappings: { Bug: "Proposed", "User Story": "Idea" },
            },
            {
              id: "col-committed",
              name: "Committed",
              stateMappings: { Bug: "Active", "User Story": "Committed" },
            },
          ],
          fields: {
            columnField: { referenceName: "WEF_FAKE_Kanban.Column" },
          },
        }),
      ),
      http.post(`${BASE}/_apis/wit/wiql`, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body.query) capturedQueries.push(body.query);
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        team: "test-project",
        sourceBoardColumn: "Committed",
        candidateBoardColumn: "Ideas",
        workItemTypes: "Bug, User Story",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(capturedQueries.some((query) => query.includes("[System.AssignedTo] = ''"))).toBe(true);
    });

    expect(
      capturedQueries.some(
        (query) =>
          query.includes("[System.AssignedTo] = ''") &&
          query.includes("[WEF_FAKE_Kanban.Column] = 'Ideas'"),
      ),
    ).toBe(true);
  });

  it("hides demo button when approval board column is empty", async () => {
    installBoardHandlers();
    server.use(http.post(`${BASE}/_apis/wit/wiql`, () => HttpResponse.json({ workItems: [] })));

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        approvalBoardColumn: "",
        closedState: "",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(screen.getByText("To Do")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Demo mode")).not.toBeInTheDocument();
  });

  it("toggles demo mode view on button click", async () => {
    const user = userEvent.setup();

    installBoardHandlers();
    server.use(http.post(`${BASE}/_apis/wit/wiql`, () => HttpResponse.json({ workItems: [] })));

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        approvalBoardColumn: "Approved",
        closedState: "Closed",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(screen.getByLabelText("Demo mode")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Demo mode"));

    await waitFor(() => {
      expect(screen.getByText(/No items in "Approved" column/)).toBeInTheDocument();
    });

    // Click again to exit
    await user.click(screen.getByLabelText("Demo mode"));

    await waitFor(() => {
      expect(screen.queryByText(/No items in "Approved" column/)).not.toBeInTheDocument();
    });
  });

  it("renders GitHub review cards from configured public repo settings", async () => {
    installBoardHandlers();
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => HttpResponse.json({ workItems: [] })),
      http.post(`${BASE}/_apis/wit/workitemsbatch`, () =>
        HttpResponse.json({
          count: 0,
          value: [],
        }),
      ),
      http.get("https://dev.azure.com/test-org/_apis/connectiondata", () =>
        HttpResponse.json({
          authenticatedUser: {
            id: "me-id",
            providerDisplayName: "Me",
            uniqueName: "me@test.com",
          },
        }),
      ),
      http.get(`${BASE}/_apis/git/pullrequests`, () => HttpResponse.json({ value: [] })),
      http.get("https://api.github.com/repos/octo-org/widgets/pulls", () =>
        HttpResponse.json([
          {
            number: 77,
            title: "Review the GitHub queue",
            html_url: "https://github.com/octo-org/widgets/pull/77",
            state: "open",
            user: { login: "someone-else" },
            requested_reviewers: [{ login: "octocat" }],
            assignees: [],
          },
        ]),
      ),
      http.get("https://api.github.com/repos/octo-org/widgets/pulls/77/reviews", () =>
        HttpResponse.json([]),
      ),
    );

    const { collections } = renderWithProviders(<App />);

    collections.settings.insert(
      createSettings({
        id: "settings",
        githubUsername: "octocat",
        githubRepository: "octo-org/widgets",
        pollInterval: 60,
      }),
    );
    collections.columns.insert({ id: "col-1", name: "To Do", order: 0 });

    await waitFor(() => {
      expect(screen.getByText("Review the GitHub queue")).toBeInTheDocument();
    });

    expect(screen.getByTestId("review-label")).toBeInTheDocument();
  });
});
