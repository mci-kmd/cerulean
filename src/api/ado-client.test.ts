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

  it("batch fetches work items", async () => {
    server.use(
      http.get(`${BASE}/_apis/wit/workitems`, ({ request }) => {
        const url = new URL(request.url);
        const ids = url.searchParams.get("ids")?.split(",").map(Number) ?? [];
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
  });

  it("returns empty array for empty ids", async () => {
    const items = await client.batchGetWorkItems([]);
    expect(items).toEqual([]);
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
        http.get(`${BASE}/_apis/wit/workitems`, () => {
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
        http.get(`${BASE}/_apis/wit/workitems`, () => {
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
        http.get(`${BASE}/_apis/wit/workitems`, () => {
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
