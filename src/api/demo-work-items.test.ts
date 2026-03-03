import { describe, it, expect, beforeEach } from "vitest";
import { MockAdoClient } from "./ado-client.mock";
import { fetchDemoWorkItems, mapAdoDemoWorkItem } from "./demo-work-items";
import { DEMO_DETAIL_FIELDS } from "./ado-client";
import { createAdoWorkItem } from "@/test/fixtures/work-items";

describe("fetchDemoWorkItems", () => {
  let client: MockAdoClient;

  beforeEach(() => {
    client = new MockAdoClient();
  });

  it("returns empty array when no items match", async () => {
    client.wiqlResult = { workItems: [] };
    const result = await fetchDemoWorkItems(client, "Resolved", "org", "proj");
    expect(result).toEqual([]);
  });

  it("fetches items with demo detail fields", async () => {
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Feature A",
          "System.WorkItemType": "User Story",
          "System.State": "Resolved",
          "System.Rev": 3,
          "System.Description": "<p>Desc</p>",
          "Microsoft.VSTS.Common.AcceptanceCriteria": "<p>AC</p>",
        },
      }),
    ];

    const result = await fetchDemoWorkItems(client, "Resolved", "org", "proj");
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("<p>Desc</p>");
    expect(result[0].acceptanceCriteria).toBe("<p>AC</p>");

    // Verify correct fields were requested
    const batchCall = client.callLog.find(
      (c) => c.method === "batchGetWorkItems",
    );
    expect(batchCall?.args[1]).toEqual(DEMO_DETAIL_FIELDS);
  });
});

describe("mapAdoDemoWorkItem", () => {
  it("maps description, acceptance criteria, and repro steps", () => {
    const ado = createAdoWorkItem({
      id: 5,
      fields: {
        "System.Id": 5,
        "System.Title": "Test",
        "System.WorkItemType": "Bug",
        "System.State": "Resolved",
        "System.Rev": 1,
        "System.Description": "<b>bold</b>",
        "Microsoft.VSTS.Common.AcceptanceCriteria": "<ul><li>done</li></ul>",
        "Microsoft.VSTS.TCM.ReproSteps": "<p>Step 1</p>",
      },
    });

    const result = mapAdoDemoWorkItem(ado, "org", "proj");
    expect(result.description).toBe("<b>bold</b>");
    expect(result.acceptanceCriteria).toBe("<ul><li>done</li></ul>");
    expect(result.reproSteps).toBe("<p>Step 1</p>");
    expect(result.type).toBe("Bug");
  });

  it("defaults missing fields to empty strings", () => {
    const ado = createAdoWorkItem({ id: 6 });
    const result = mapAdoDemoWorkItem(ado, "org", "proj");
    expect(result.description).toBe("");
    expect(result.acceptanceCriteria).toBe("");
    expect(result.reproSteps).toBe("");
  });
});
