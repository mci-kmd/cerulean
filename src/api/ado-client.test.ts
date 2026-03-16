import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
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
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, ({ request }) => {
        capturedAuth = request.headers.get("authorization") ?? "";
        return HttpResponse.json({ workItems: [] });
      }),
    );

    await client.queryWorkItems("SELECT [System.Id] FROM WorkItems");
    expect(capturedAuth).toBe(`Basic ${btoa(":test-pat")}`);
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

  it("throws on failed WIQL query", async () => {
    server.use(
      http.post(`${BASE}/_apis/wit/wiql`, () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(client.queryWorkItems("SELECT ...")).rejects.toThrow("401");
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

  describe("startWorkItem", () => {
    it("sends PATCH with state + assignedTo ops", async () => {
      let capturedBody: unknown = null;
      let capturedContentType = "";
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
});
