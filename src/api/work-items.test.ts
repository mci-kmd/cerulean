import { describe, it, expect } from "vitest";
import { mapAdoWorkItem, fetchWorkItemsInitial, fetchWorkItemsDelta, fetchCandidateWorkItems } from "./work-items";
import { MockAdoClient } from "./ado-client.mock";
import { createAdoWorkItem } from "@/test/fixtures/work-items";

describe("mapAdoWorkItem", () => {
  it("maps ADO fields to WorkItem", () => {
    const ado = createAdoWorkItem({
      id: 42,
      fields: {
        "System.Id": 42,
        "System.Title": "Fix the bug",
        "System.WorkItemType": "Bug",
        "System.State": "Active",
        "System.Rev": 3,
      },
    });

    const wi = mapAdoWorkItem(ado, "my-org", "my-proj");
    expect(wi.id).toBe(42);
    expect(wi.title).toBe("Fix the bug");
    expect(wi.type).toBe("Bug");
    expect(wi.state).toBe("Active");
    expect(wi.rev).toBe(3);
  });

  it("uses link href when available", () => {
    const ado = createAdoWorkItem({
      id: 1,
      _links: { html: { href: "https://custom-link" } },
    });
    const wi = mapAdoWorkItem(ado, "org", "proj");
    expect(wi.url).toBe("https://custom-link");
  });
});

describe("fetchWorkItemsInitial", () => {
  it("fetches all items from WIQL", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = {
      workItems: [{ id: 1, url: "" }, { id: 2, url: "" }],
    };
    client.workItems = [
      createAdoWorkItem({ id: 1 }),
      createAdoWorkItem({ id: 2 }),
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems).toHaveLength(2);
    expect(result.revMap.size).toBe(2);
  });

  it("returns empty for no WIQL results", async () => {
    const client = new MockAdoClient();
    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems).toHaveLength(0);
  });
});

describe("fetchWorkItemsDelta", () => {
  it("only fetches changed items", async () => {
    const client = new MockAdoClient();

    // WIQL returns items 1, 2
    client.wiqlResult = {
      workItems: [{ id: 1, url: "" }, { id: 2, url: "" }],
    };

    // First batch call (rev check) returns revs
    const item1 = createAdoWorkItem({
      id: 1,
      fields: {
        "System.Id": 1,
        "System.Rev": 2, // changed
        "System.Title": "Updated",
        "System.WorkItemType": "Task",
        "System.State": "Active",
      },
    });
    const item2 = createAdoWorkItem({
      id: 2,
      fields: {
        "System.Id": 2,
        "System.Rev": 1, // unchanged
        "System.Title": "Same",
        "System.WorkItemType": "Task",
        "System.State": "Active",
      },
    });

    client.workItems = [item1, item2];

    const cachedRevMap = new Map([
      [1, { rev: 1 }],
      [2, { rev: 1 }],
    ]);

    const cachedItems = [
      { id: 1, title: "Old", type: "Task", state: "Active", rev: 1, url: "" },
      { id: 2, title: "Same", type: "Task", state: "Active", rev: 1, url: "" },
    ];

    const result = await fetchWorkItemsDelta(
      client,
      "Active",
      "org",
      "proj",
      cachedRevMap,
      cachedItems,
    );

    expect(result.workItems).toHaveLength(2);
    // Item 1 should be updated
    const updated = result.workItems.find((w) => w.id === 1);
    expect(updated?.title).toBe("Updated");
  });
});

describe("fetchCandidateWorkItems", () => {
  it("returns mapped items", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = {
      workItems: [{ id: 10, url: "" }, { id: 11, url: "" }],
    };
    client.workItems = [
      createAdoWorkItem({ id: 10, fields: { "System.Id": 10, "System.Title": "Candidate A", "System.WorkItemType": "Bug", "System.State": "New", "System.Rev": 1 } }),
      createAdoWorkItem({ id: 11, fields: { "System.Id": 11, "System.Title": "Candidate B", "System.WorkItemType": "Task", "System.State": "New", "System.Rev": 1 } }),
    ];

    const items = await fetchCandidateWorkItems(client, "New", "org", "proj");
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Candidate A");
    expect(items[1].title).toBe("Candidate B");
  });

  it("caps at 50 results", async () => {
    const client = new MockAdoClient();
    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    client.wiqlResult = { workItems: ids.map((id) => ({ id, url: "" })) };
    client.workItems = ids.map((id) => createAdoWorkItem({ id }));

    const items = await fetchCandidateWorkItems(client, "New", "org", "proj");
    expect(items).toHaveLength(50);
  });

  it("returns empty for no results", async () => {
    const client = new MockAdoClient();
    const items = await fetchCandidateWorkItems(client, "New", "org", "proj");
    expect(items).toHaveLength(0);
  });
});
