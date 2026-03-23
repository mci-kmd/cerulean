import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { HttpAdoClient, WorkItemAlreadyAssignedError } from "./ado-client";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

const BASE = "https://dev.azure.com/test-org/test-project";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("HttpAdoClient", () => {
  const client = new HttpAdoClient({
    pat: "test-pat",
    org: "test-org",
    project: "test-project",
  });

  it("sends auth header on WIQL query", async () => {
    let capturedAuth = "";
    let capturedAccept = "";
    let capturedFedAuthRedirect = "";
    let capturedForceMsaPassThrough = "";
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        capturedAccept = request.headers.get("accept") ?? "";
        capturedFedAuthRedirect = request.headers.get("x-tfs-fedauthredirect") ?? "";
        capturedForceMsaPassThrough = request.headers.get("x-vss-forcemsapassthrough") ?? "";
        return HttpResponse.json({ workItems: [] });
      }),
    );

    await client.queryWorkItems("SELECT [System.Id] FROM WorkItems");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(capturedAccept).toBe("application/json");
    expect(capturedFedAuthRedirect).toBe("Suppress");
    expect(capturedForceMsaPassThrough).toBe("true");
  });

  it("returns work items from WIQL", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({
          workItems: [{ id: 1, url: "http://test" }],
        });
      }),
    );

    const result = await client.queryWorkItems("SELECT ...");
    expect(result.workItems).toHaveLength(1);
    expect(result.workItems[0].id).toBe(1);
  });

  it("normalizes org, project, and PAT before WIQL query", async () => {
    const normalizedClient = new HttpAdoClient({
      pat: "  test-pat  ",
      org: " https://dev.azure.com/test-org/ ",
      project: " test project ",
    });
    let capturedAuth = "";
    let capturedPathname = "";

    server.use(
      http.post("https://dev.azure.com/test-org/test%20project/_apis/wit/wiql", ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        capturedPathname = new URL(request.url).pathname;
        return HttpResponse.json({ workItems: [] });
      }),
    );

    await normalizedClient.queryWorkItems("SELECT ...");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(capturedPathname).toBe("/test-org/test%20project/_apis/wit/wiql");
  });

  it("throws on failed WIQL query", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(client.queryWorkItems("SELECT ...")).rejects.toThrow("401");
  });

  it("lists builds with auth header and branch filter", async () => {
    let capturedAuth = "";
    let capturedBranch = "";
    let capturedTop = "";
    server.use(
      http.get(`${BASE}/_apis/build/builds`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        const url = new URL(request.url);
        capturedBranch = url.searchParams.get("branchName") ?? "";
        capturedTop = url.searchParams.get("$top") ?? "";
        return HttpResponse.json({
          value: [
            {
              id: 42,
              buildNumber: "#20260320.4 • Merged PR 123: Improve login flow",
              status: "completed",
              result: "succeeded",
              sourceBranch: "refs/heads/master",
              definition: { id: 7, name: "CI" },
            },
          ],
        });
      }),
    );

    const builds = await client.listBuilds("refs/heads/master", 50);
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(capturedBranch).toBe("refs/heads/master");
    expect(capturedTop).toBe("50");
    expect(builds).toEqual([
      {
        id: 42,
        buildNumber: "#20260320.4 • Merged PR 123: Improve login flow",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 7, name: "CI" },
      },
    ]);
  });

  it("throws on failed builds fetch", async () => {
    server.use(
      http.get(`${BASE}/_apis/build/builds`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    await expect(client.listBuilds("refs/heads/master", 10)).rejects.toThrow("403");
  });

  it("lists boards without duplicating the default team path", async () => {
    let capturedPathname = "";
    server.use(
      http.get(`${BASE}/_apis/work/boards`, ({ request }) => {
        capturedPathname = new URL(request.url).pathname;
        return HttpResponse.json({
          value: [{ id: "board-1", name: "Stories", url: `${BASE}/_apis/work/boards/board-1` }],
        });
      }),
    );

    const boards = await client.listBoards("test-project");
    expect(capturedPathname).toBe("/test-org/test-project/_apis/work/boards");
    expect(boards).toHaveLength(1);
  });

  it("gets board without duplicating the default team path", async () => {
    let capturedPathname = "";
    server.use(
      http.get(`${BASE}/_apis/work/boards/board-1`, ({ request }) => {
        capturedPathname = new URL(request.url).pathname;
        return HttpResponse.json({
          id: "board-1",
          name: "Stories",
          url: `${BASE}/_apis/work/boards/board-1`,
          fields: {
            columnField: { referenceName: "WEF_FAKE_Kanban.Column" },
          },
          columns: [],
        });
      }),
    );

    const board = await client.getBoard("board-1", "test-project");
    expect(capturedPathname).toBe("/test-org/test-project/_apis/work/boards/board-1");
    expect(board.id).toBe("board-1");
  });

  it("throws a clear error when WIQL returns HTML instead of JSON", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return new HttpResponse("<!DOCTYPE html><html><body>Sign in</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }),
    );

    await expect(client.queryWorkItems("SELECT ...")).rejects.toThrow(
      /WIQL query returned non-JSON response.*sign-in page/,
    );
  });

  it("batch fetches work items with split field and relation requests", async () => {
    type BatchBody = { ids?: number[]; fields?: string[]; $expand?: string };
    const capturedBodies: BatchBody[] = [];

    server.use(
      http.post(`${BASE}/_apis/wit/workitemsbatch`, async ({ request }) => {
        const body = await request.json() as BatchBody;
        capturedBodies.push(body);
        const ids = body.ids ?? [];

        if (body.$expand === "Relations") {
          return HttpResponse.json({
            count: ids.length,
            value: ids.map((id) => ({
              id,
              rev: 1,
              fields: { "System.Id": id, "System.Rev": 1 },
              relations: [{ rel: "ArtifactLink", url: `vstfs:///Git/PullRequestId/a/b/${id}` }],
              url: `${BASE}/_apis/wit/workItems/${id}`,
            })),
          });
        }

        expect(body.$expand).toBeUndefined();
        expect(body.fields).toEqual([
          "System.Id",
          "System.Title",
          "System.WorkItemType",
          "System.State",
          "System.AssignedTo",
          "System.Rev",
        ]);
        return HttpResponse.json({
          count: ids.length,
          value: ids.map((id) => ({
            id,
            rev: 1,
            fields: {
              "System.Id": id,
              "System.Title": `Item ${id}`,
              "System.WorkItemType": "Task",
              "System.State": "Active",
              "System.Rev": 1,
            },
            url: `${BASE}/_apis/wit/workItems/${id}`,
          })),
        });
      }),
    );

    const items = await client.batchGetWorkItems([1, 2]);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(1);
    expect(items[1].id).toBe(2);
    expect(items[0].relations).toEqual([
      { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/a/b/1" },
    ]);
    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies).toContainEqual({
      ids: [1, 2],
      fields: [
        "System.Id",
        "System.Title",
        "System.WorkItemType",
        "System.State",
        "System.AssignedTo",
        "System.Rev",
      ],
    });
    expect(capturedBodies).toContainEqual({
      ids: [1, 2],
      $expand: "Relations",
    });
  });

  it("returns empty array for empty ids", async () => {
    const items = await client.batchGetWorkItems([]);
    expect(items).toEqual([]);
  });

  it("never sends fields with expand in the same batch request", async () => {
    type BatchBody = { ids?: number[]; fields?: string[]; $expand?: string };
    const capturedBodies: BatchBody[] = [];

    server.use(
      http.post(`${BASE}/_apis/wit/workitemsbatch`, async ({ request }) => {
        const body = await request.json() as BatchBody;
        capturedBodies.push(body);
        const ids = body.ids ?? [];

        if (body.$expand === "Relations" && body.fields) {
          return HttpResponse.json(
            { message: "The expand parameter can not be used with the fields parameter." },
            { status: 400 },
          );
        }

        if (body.$expand === "Relations") {
          return HttpResponse.json({
            count: ids.length,
            value: ids.map((id) => ({
              id,
              rev: 1,
              fields: { "System.Id": id, "System.Rev": 1 },
              relations: [{ rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/a/b/123" }],
              url: `${BASE}/_apis/wit/workItems/${id}`,
            })),
          });
        }

        return HttpResponse.json({
          count: ids.length,
          value: ids.map((id) => ({
            id,
            rev: 1,
            fields: {
              "System.Id": id,
              "System.Title": `Item ${id}`,
              "System.WorkItemType": "Task",
              "System.State": "Active",
              "System.Rev": 1,
            },
            url: `${BASE}/_apis/wit/workItems/${id}`,
          })),
        });
      }),
    );

    const items = await client.batchGetWorkItems([7]);
    expect(items).toHaveLength(1);
    expect(items[0].relations).toEqual([
      { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/a/b/123" },
    ]);
    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies.every((body) => !(body.$expand && body.fields))).toBe(true);
    expect(capturedBodies).toContainEqual({
      ids: [7],
      fields: [
        "System.Id",
        "System.Title",
        "System.WorkItemType",
        "System.State",
        "System.AssignedTo",
        "System.Rev",
      ],
    });
    expect(capturedBodies).toContainEqual({
      ids: [7],
      $expand: "Relations",
    });
  });

  it("throws a clear error when work item batch fetch returns HTML instead of JSON", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
        return new HttpResponse("<!DOCTYPE html><html><body>Sign in</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }),
    );

    await expect(client.batchGetWorkItems([1])).rejects.toThrow(
      /Work items batch fetch returned non-JSON response/,
    );
  });

  it("fetches repositories with auth header", async () => {
    let capturedAuth = "";
    server.use(
      http.get(`${BASE}/_apis/git/repositories`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        return HttpResponse.json({
          value: [
            {
              id: "repo-1",
              name: "Repo One",
              defaultBranch: "refs/heads/main",
            },
          ],
        });
      }),
    );

    const repositories = await client.listRepositories();
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(repositories).toEqual([
      {
        id: "repo-1",
        name: "Repo One",
        defaultBranch: "refs/heads/main",
      },
    ]);
  });

  it("fetches refs with filter and auth header", async () => {
    let capturedAuth = "";
    let capturedFilter = "";
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/refs`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        capturedFilter = new URL(request.url).searchParams.get("filter") ?? "";
        return HttpResponse.json({
          value: [{ name: "refs/heads/1234-fix-login" }],
        });
      }),
    );

    const refs = await client.listRefs("repo-1", "heads/1234");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(capturedFilter).toBe("heads/1234");
    expect(refs).toEqual([{ name: "refs/heads/1234-fix-login" }]);
  });

  it("throws on failed refs fetch", async () => {
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/refs`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    await expect(client.listRefs("repo-1", "heads/1234")).rejects.toThrow("403");
  });

  it("fetches pull request details with auth header", async () => {
    let capturedAuth = "";
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/pullRequests/123`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        return HttpResponse.json({
          pullRequestId: 123,
          title: "Improve login flow",
          status: "completed",
        });
      }),
    );

    const pr = await client.getPullRequest("repo-1", "123");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(pr).toEqual({
      pullRequestId: 123,
      title: "Improve login flow",
      status: "completed",
    });
  });

  it("throws on failed pull request fetch", async () => {
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/pullRequests/123`, () => {
        return new HttpResponse(null, { status: 404 });
      }),
    );

    await expect(client.getPullRequest("repo-1", "123")).rejects.toThrow("404");
  });

  it("fetches pull request statuses with auth header", async () => {
    let capturedAuth = "";
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/pullRequests/123/statuses`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        return HttpResponse.json({
          value: [{ state: "failed", description: "CI Build" }],
          count: 1,
        });
      }),
    );

    const statuses = await client.getPullRequestStatuses("repo-1", "123");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(statuses).toEqual([{ state: "failed", description: "CI Build" }]);
  });

  it("throws on failed pull request statuses fetch", async () => {
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/pullRequests/123/statuses`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    await expect(client.getPullRequestStatuses("repo-1", "123")).rejects.toThrow("403");
  });

  it("fetches pull request threads with auth header", async () => {
    let capturedAuth = "";
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/pullRequests/123/threads`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        return HttpResponse.json({
          value: [
            {
              status: "active",
              comments: [{ isDeleted: false }],
            },
          ],
          count: 1,
        });
      }),
    );

    const threads = await client.getPullRequestThreads("repo-1", "123");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(threads).toEqual([
      {
        status: "active",
        comments: [{ isDeleted: false }],
      },
    ]);
  });

  it("throws on failed pull request threads fetch", async () => {
    server.use(
      http.get(`${BASE}/_apis/git/repositories/repo-1/pullRequests/123/threads`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    await expect(client.getPullRequestThreads("repo-1", "123")).rejects.toThrow("403");
  });

  it("fetches pull request policy evaluations with auth header", async () => {
    let capturedAuth = "";
    server.use(
      http.get(`${BASE}/_apis/policy/evaluations`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        expect(new URL(request.url).searchParams.get("artifactId")).toBe(
          "vstfs:///CodeReview/CodeReviewId/project-1/123",
        );
        return HttpResponse.json({
          value: [
            {
              status: "rejected",
              configuration: {
                isBlocking: true,
                type: { displayName: "CI Build" },
              },
            },
          ],
        });
      }),
    );

    const evaluations = await client.getPullRequestPolicyEvaluations(
      "vstfs:///CodeReview/CodeReviewId/project-1/123",
    );
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
    expect(evaluations).toEqual([
      {
        status: "rejected",
        configuration: {
          isBlocking: true,
          type: { displayName: "CI Build" },
        },
      },
    ]);
  });

  it("throws on failed pull request policy evaluations fetch", async () => {
    server.use(
      http.get(`${BASE}/_apis/policy/evaluations`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    await expect(
      client.getPullRequestPolicyEvaluations("vstfs:///CodeReview/CodeReviewId/project-1/123"),
    ).rejects.toThrow("403");
  });

  it("tests connection successfully", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return HttpResponse.json({ workItems: [] });
      }),
    );

    const ok = await client.testConnection();
    expect(ok).toBe(true);
  });

  it("tests connection failure", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    const ok = await client.testConnection();
    expect(ok).toBe(false);
  });

  it("updates work item state with PATCH and json-patch content type", async () => {
    let capturedContentType = "";
    let capturedBody: unknown = null;
    server.use(
      http.patch(`${BASE}/_apis/wit/workitems/42`, async ({ request }) => {
        capturedContentType = request.headers.get("content-type") ?? "";
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 42,
          rev: 2,
          fields: { "System.Id": 42, "System.State": "Closed" },
          url: `${BASE}/_apis/wit/workItems/42`,
        });
      }),
    );

    const result = await client.updateWorkItemState(42, "Closed");
    expect(capturedContentType).toBe("application/json-patch+json");
    expect(capturedBody).toEqual([
      { op: "replace", path: "/fields/System.State", value: "Closed" },
    ]);
    expect(result.id).toBe(42);
  });

  it("throws on failed state update", async () => {
    server.use(
      http.patch(`${BASE}/_apis/wit/workitems/42`, () => {
        return new HttpResponse(null, { status: 400 });
      }),
    );

    await expect(client.updateWorkItemState(42, "Bad")).rejects.toThrow("400");
  });

  it("includes board column ops on state update when configured", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.patch(`${BASE}/_apis/wit/workitems/42`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 42,
          rev: 2,
          fields: { "System.Id": 42, "System.State": "Closed" },
          url: `${BASE}/_apis/wit/workItems/42`,
        });
      }),
    );

    await client.updateWorkItemState(
      42,
      "Closed",
      "WEF_FAKE_Kanban.Column",
      "Approved",
    );

    expect(capturedBody).toEqual([
      { op: "replace", path: "/fields/System.State", value: "Closed" },
      { op: "add", path: "/fields/WEF_FAKE_Kanban.Column", value: "Approved" },
    ]);
  });

  it("updates work item tags from the latest server value", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
        return HttpResponse.json({
          count: 1,
          value: [{
            id: 42,
            rev: 1,
            fields: {
              "System.Id": 42,
              "System.State": "Active",
              "System.Rev": 1,
              "System.Tags": "Existing; UI Review",
            },
            url: `${BASE}/_apis/wit/workItems/42`,
          }],
        });
      }),
      http.patch(`${BASE}/_apis/wit/workitems/42`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 42,
          rev: 2,
          fields: {
            "System.Id": 42,
            "System.State": "Active",
            "System.Tags": "Existing; UI",
          },
          url: `${BASE}/_apis/wit/workItems/42`,
        });
      }),
    );

    const result = await client.updateWorkItemTags(42, ["UI"], ["UI Review"]);

    expect(capturedBody).toEqual([
      { op: "add", path: "/fields/System.Tags", value: "Existing; UI" },
    ]);
    expect(result.id).toBe(42);
  });

  describe("startWorkItem", () => {
    it("sends PATCH with state + assignedTo ops", async () => {
      let capturedBody: unknown = null;
      let capturedContentType = "";
      let capturedConnectionAccept = "";
      let capturedConnectionFedAuthRedirect = "";
      let capturedConnectionForceMsaPassThrough = "";
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", ({ request }) => {
          capturedConnectionAccept = request.headers.get("accept") ?? "";
          capturedConnectionFedAuthRedirect = request.headers.get("x-tfs-fedauthredirect") ?? "";
          capturedConnectionForceMsaPassThrough =
            request.headers.get("x-vss-forcemsapassthrough") ?? "";
          return HttpResponse.json({
            authenticatedUser: {
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
          return HttpResponse.json({
            count: 1,
            value: [{ id: 99, rev: 1, fields: { "System.Id": 99, "System.State": "New", "System.Rev": 1 }, url: `${BASE}/_apis/wit/workItems/99` }],
          });
        }),
        http.patch(`${BASE}/_apis/wit/workitems/99`, async ({ request }) => {
          capturedContentType = request.headers.get("content-type") ?? "";
          capturedBody = await request.json();
          return HttpResponse.json({
            id: 99,
            rev: 2,
            fields: { "System.Id": 99, "System.State": "Active" },
            url: `${BASE}/_apis/wit/workItems/99`,
          });
        }),
      );

      const result = await client.startWorkItem(99, "Active");
      expect(capturedConnectionAccept).toBe("application/json");
      expect(capturedConnectionFedAuthRedirect).toBe("Suppress");
      expect(capturedConnectionForceMsaPassThrough).toBe("true");
      expect(capturedContentType).toBe("application/json-patch+json");
      expect(capturedBody).toEqual([
        { op: "replace", path: "/fields/System.State", value: "Active" },
        { op: "replace", path: "/fields/System.AssignedTo", value: "user@test.com" },
      ]);
      expect(result.id).toBe(99);
    });

    it("throws on failure", async () => {
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
          return HttpResponse.json({
            count: 1,
            value: [{ id: 99, rev: 1, fields: { "System.Id": 99, "System.State": "New", "System.Rev": 1 }, url: `${BASE}/_apis/wit/workItems/99` }],
          });
        }),
        http.patch(`${BASE}/_apis/wit/workitems/99`, () => {
          return new HttpResponse(null, { status: 400 });
        }),
      );

      await expect(client.startWorkItem(99, "Active")).rejects.toThrow("400");
    });

    it("includes board column ops when configured", async () => {
      let capturedBody: unknown = null;
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
          return HttpResponse.json({
            count: 1,
            value: [{ id: 99, rev: 1, fields: { "System.Id": 99, "System.State": "New", "System.Rev": 1 }, url: `${BASE}/_apis/wit/workItems/99` }],
          });
        }),
        http.patch(`${BASE}/_apis/wit/workitems/99`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            id: 99,
            rev: 2,
            fields: { "System.Id": 99, "System.State": "Active" },
            url: `${BASE}/_apis/wit/workItems/99`,
          });
        }),
      );

      await client.startWorkItem(
        99,
        "Active",
        "WEF_FAKE_Kanban.Column",
        "Approved",
      );

      expect(capturedBody).toEqual([
        { op: "replace", path: "/fields/System.State", value: "Active" },
        { op: "replace", path: "/fields/System.AssignedTo", value: "user@test.com" },
        { op: "add", path: "/fields/WEF_FAKE_Kanban.Column", value: "Approved" },
      ]);
    });

    it("throws WorkItemAlreadyAssignedError when assigned to someone else", async () => {
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.post(`${BASE}/_apis/wit/workitemsbatch`, () => {
          return HttpResponse.json({
            count: 1,
            value: [{
              id: 99, rev: 1,
              fields: {
                "System.Id": 99, "System.State": "New", "System.Rev": 1,
                "System.AssignedTo": { displayName: "Someone Else", uniqueName: "other@test.com" },
              },
              url: `${BASE}/_apis/wit/workItems/99`,
            }],
          });
        }),
      );

      await expect(client.startWorkItem(99, "Active")).rejects.toThrow(WorkItemAlreadyAssignedError);
    });
  });

  describe("returnWorkItemToCandidate", () => {
    it("sends PATCH with state + clear assignee ops", async () => {
      let capturedBody: unknown = null;
      let capturedContentType = "";
      server.use(
        http.patch(`${BASE}/_apis/wit/workitems/99`, async ({ request }) => {
          capturedContentType = request.headers.get("content-type") ?? "";
          capturedBody = await request.json();
          return HttpResponse.json({
            id: 99,
            rev: 2,
            fields: { "System.Id": 99, "System.State": "New" },
            url: `${BASE}/_apis/wit/workItems/99`,
          });
        }),
      );

      const result = await client.returnWorkItemToCandidate(99, "New");
      expect(capturedContentType).toBe("application/json-patch+json");
      expect(capturedBody).toEqual([
        { op: "add", path: "/fields/System.State", value: "New" },
        { op: "add", path: "/fields/System.AssignedTo", value: "" },
      ]);
      expect(result.id).toBe(99);
    });

    it("throws on failure", async () => {
      server.use(
        http.patch(`${BASE}/_apis/wit/workitems/99`, () => {
          return new HttpResponse(null, { status: 400 });
        }),
      );

      await expect(client.returnWorkItemToCandidate(99, "New")).rejects.toThrow("400");
    });
  });

  describe("pull request reviewer mutations", () => {
    it("adds current user as optional reviewer with vote 0", async () => {
      const reviewClient = new HttpAdoClient({
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
      });
      let capturedBody: unknown = null;
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              id: "user-id",
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.put(
          `${BASE}/_apis/git/repositories/repo-1/pullRequests/77/reviewers/user-id`,
          async ({ request }) => {
            capturedBody = await request.json();
            return HttpResponse.json({
              id: "user-id",
              vote: 0,
            });
          },
        ),
      );

      await expect(
        reviewClient.addCurrentUserAsPullRequestReviewer("repo-1", "77"),
      ).resolves.toBeUndefined();
      expect(capturedBody).toEqual({
        id: "user-id",
        vote: 0,
      });
    });

    it("approves a pull request as the current user", async () => {
      const reviewClient = new HttpAdoClient({
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
      });
      let capturedBody: unknown = null;
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              id: "user-id",
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.put(
          `${BASE}/_apis/git/repositories/repo-1/pullRequests/78/reviewers/user-id`,
          async ({ request }) => {
            capturedBody = await request.json();
            return HttpResponse.json({
              id: "user-id",
              vote: 10,
            });
          },
        ),
      );

      await expect(
        reviewClient.approvePullRequestAsCurrentUser("repo-1", "78"),
      ).resolves.toBeUndefined();
      expect(capturedBody).toEqual({
        id: "user-id",
        vote: 10,
      });
    });

    it("adds PAT scope guidance when reviewer update is unauthorized", async () => {
      const reviewClient = new HttpAdoClient({
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
      });
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              id: "user-id",
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.put(`${BASE}/_apis/git/repositories/repo-1/pullRequests/79/reviewers/user-id`, () => {
          return new HttpResponse(null, { status: 401 });
        }),
      );

      await expect(
        reviewClient.addCurrentUserAsPullRequestReviewer("repo-1", "79"),
      ).rejects.toThrow("Code (Read & write)");
    });

    it("adds PAT scope guidance when the browser blocks reviewer update requests", async () => {
      const reviewClient = new HttpAdoClient({
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.startsWith("https://dev.azure.com/test-org/_apis/connectiondata")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                authenticatedUser: {
                  id: "user-id",
                  properties: { Account: { $value: "user@test.com" } },
                },
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            ),
          );
        }

        if (url.includes("/pullRequests/80/reviewers/user-id")) {
          return Promise.reject(new TypeError("Failed to fetch"));
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      try {
        await expect(
          reviewClient.addCurrentUserAsPullRequestReviewer("repo-1", "80"),
        ).rejects.toThrow("browser can block this when the PAT is missing Code (Read & write)");
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("removes the current user as reviewer", async () => {
      const reviewClient = new HttpAdoClient({
        pat: "test-pat",
        org: "test-org",
        project: "test-project",
      });
      let deleteCalled = false;
      server.use(
        http.get("https://dev.azure.com/test-org/_apis/connectiondata*", () => {
          return HttpResponse.json({
            authenticatedUser: {
              id: "user-id",
              properties: { Account: { $value: "user@test.com" } },
            },
          });
        }),
        http.delete(
          `${BASE}/_apis/git/repositories/repo-1/pullRequests/81/reviewers/user-id`,
          () => {
            deleteCalled = true;
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );

      await expect(
        reviewClient.removeCurrentUserAsPullRequestReviewer("repo-1", "81"),
      ).resolves.toBeUndefined();
      expect(deleteCalled).toBe(true);
    });
  });
});
