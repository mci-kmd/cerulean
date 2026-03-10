import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { MockAdoClient } from "@/api/ado-client.mock";
import { createAdoWorkItem } from "@/test/fixtures/work-items";
import { CandidateTray } from "./candidate-tray";
import type { AdoClient } from "@/api/ado-client";

describe("CandidateTray", () => {
  let client: MockAdoClient;

  beforeEach(() => {
    client = new MockAdoClient();
    client.wiqlResult = {
      workItems: [{ id: 1, url: "" }, { id: 2, url: "" }],
    };
    client.workItems = [
      createAdoWorkItem({ id: 1, fields: { "System.Id": 1, "System.Title": "Item A", "System.WorkItemType": "Bug", "System.State": "New", "System.Rev": 1 } }),
      createAdoWorkItem({ id: 2, fields: { "System.Id": 2, "System.Title": "Item B", "System.WorkItemType": "Task", "System.State": "New", "System.Rev": 1 } }),
    ];
  });

  it("is collapsed by default showing label", () => {
    renderWithProviders(
      <CandidateTray client={client} candidateState="New" sourceState="Active" org="org" project="proj" />,
    );
    expect(screen.getByText("New Work")).toBeInTheDocument();
    expect(screen.queryByText("Item A")).not.toBeInTheDocument();
  });

  it("expands on click and shows cards", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CandidateTray client={client} candidateState="New" sourceState="Active" org="org" project="proj" />,
    );

    await user.click(screen.getByRole("button", { name: /expand/i }));

    await waitFor(() => {
      expect(screen.getByText("Item A")).toBeInTheDocument();
      expect(screen.getByText("Item B")).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching", async () => {
    const user = userEvent.setup();
    // Make fetch hang
    client.wiqlResult = { workItems: [] };
    client.workItems = [];

    // Use a slow client that takes time
    const slowClient = new MockAdoClient();
    let resolve: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    slowClient.queryWorkItems = async () => {
      await promise;
      return { workItems: [] };
    };

    renderWithProviders(
      <CandidateTray
        client={slowClient as unknown as AdoClient}
        candidateState="New"
        sourceState="Active"
        org="org"
        project="proj"
      />,
    );

    await user.click(screen.getByRole("button", { name: /expand/i }));

    // Should show skeletons while loading
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);

    resolve!();
  });

  it("shows empty state when no candidates", async () => {
    const user = userEvent.setup();
    client.wiqlResult = { workItems: [] };
    client.workItems = [];

    renderWithProviders(
      <CandidateTray client={client} candidateState="New" sourceState="Active" org="org" project="proj" />,
    );

    await user.click(screen.getByRole("button", { name: /expand/i }));

    await waitFor(() => {
      expect(screen.getByText("No candidate items found")).toBeInTheDocument();
    });
  });
});
