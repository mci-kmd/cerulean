import { describe, it, expect } from "vitest";
import {
  mapAdoWorkItem,
  fetchWorkItemsInitial,
  fetchWorkItemsDelta,
  fetchCompletedWorkItems,
  fetchCandidateWorkItems,
} from "./work-items";
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

  it("maps related pull request artifact links", () => {
    const ado = createAdoWorkItem({
      id: 2,
      relations: [
        {
          rel: "ArtifactLink",
          url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2f11111111-2222-3333-4444-555555555555%2f123",
          attributes: { name: "Pull Request" },
        },
      ],
    });

    const wi = mapAdoWorkItem(ado, "org", "proj");
    expect(wi.relatedPullRequests).toEqual([
      {
        id: "123",
        label: "PR #123",
        url: "https://dev.azure.com/org/proj/_git/11111111-2222-3333-4444-555555555555/pullrequest/123",
      },
    ]);
  });

  it("keeps direct pull request links and ignores non-pr relations", () => {
    const ado = createAdoWorkItem({
      id: 3,
      relations: [
        {
          rel: "ArtifactLink",
          url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/456",
          attributes: { name: "Pull Request" },
        },
        {
          rel: "ArtifactLink",
          url: "vstfs:///Git/Commit/aaaaaaaa%2fbbbbbbbb",
          attributes: { name: "Fixed in Commit" },
        },
      ],
    });

    const wi = mapAdoWorkItem(ado, "org", "proj");
    expect(wi.relatedPullRequests).toEqual([
      {
        id: "456",
        label: "PR #456",
        url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/456",
      },
    ]);
  });

  it("maps pull request title and completion metadata when available", () => {
    const ado = createAdoWorkItem({
      id: 4,
      relations: [
        {
          rel: "ArtifactLink",
          url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/789",
          attributes: {
            name: "Pull Request",
            title: "Improve deployments",
            status: "completed",
            mergeStatus: "succeeded",
          },
        },
      ],
    });

    const wi = mapAdoWorkItem(ado, "org", "proj");
    expect(wi.relatedPullRequests).toEqual([
      {
        id: "789",
        label: "PR #789",
        title: "Improve deployments",
        status: "completed",
        mergeStatus: "succeeded",
        isCompleted: true,
        url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/789",
      },
    ]);
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

  it("filters removed items from initial results", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = {
      workItems: [{ id: 1, url: "" }, { id: 2, url: "" }],
    };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Keep me",
          "System.WorkItemType": "Task",
          "System.State": "Active",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 2,
        fields: {
          "System.Id": 2,
          "System.Title": "Drop me",
          "System.WorkItemType": "Task",
          "System.State": "Removed",
          "System.Rev": 2,
        },
      }),
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(result.workItems).toHaveLength(1);
    expect(result.workItems[0]?.id).toBe(1);
    expect(result.revMap.has(1)).toBe(true);
    expect(result.revMap.has(2)).toBe(false);
  });

  it("returns empty for no WIQL results", async () => {
    const client = new MockAdoClient();
    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems).toHaveLength(0);
  });

  it("queries source items by board column when configured", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [] };

    await fetchWorkItemsInitial(
      client,
      "Active",
      "org",
      "proj",
      "",
      "Bug, User Story",
      "Approved",
      {
        team: "My Team",
        boardId: "board-1",
        boardName: "Stories",
        intakeColumnName: "Incoming",
        intakeColumnIsSplit: false,
        columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
        intakeStateMappings: {},
        boardColumnsByName: {
          approved: {
            isSplit: false,
            stateMappings: {
              Bug: "Active",
              "User Story": "Committed",
            },
          },
        },
      },
    );

    const wiql = client.callLog[0]?.args[0];
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'Approved'");
    expect(wiql).toContain("[System.AssignedTo] = @Me");
    expect(wiql).toContain("[System.WorkItemType] IN ('Bug', 'User Story')");
  });

  it("queries source items by split board column on the active side", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [] };

    await fetchWorkItemsInitial(
      client,
      "Active",
      "org",
      "proj",
      "",
      "Bug",
      "Approved",
      {
        team: "My Team",
        boardId: "board-1",
        boardName: "Stories",
        intakeColumnName: "Incoming",
        intakeColumnIsSplit: false,
        columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
        doneFieldReferenceName: "WEF_FAKE_Kanban.Column.Done",
        intakeStateMappings: {},
        boardColumnsByName: {
          approved: {
            isSplit: true,
            stateMappings: {
              Bug: "Active",
            },
          },
        },
      },
    );

    const wiql = client.callLog[0]?.args[0];
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'Approved'");
    expect(wiql).toContain("[System.AssignedTo] = @Me");
  });

  it("enriches related pull requests with fetched title/status/merge status", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with PR",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f123",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/123", {
      pullRequestId: 123,
      title: "Improve login flow",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "123",
        label: "PR #123",
        title: "Improve login flow",
        status: "completed",
        mergeStatus: "succeeded",
        approvalCount: 1,
        requiredReviewersApproved: true,
        requiredReviewersPendingCount: 0,
        isCompleted: true,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/123",
      },
    ]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequest"),
    ).toHaveLength(1);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequestThreads"),
    ).toHaveLength(0);
  });

  it("enriches active pull requests with unresolved thread counts", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with unresolved comments",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f777",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/777", {
      pullRequestId: 777,
      title: "Unresolved comments PR",
      status: "active",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.pullRequestThreads.set("repo-1/777", [
      {
        status: "active",
        comments: [{ isDeleted: false }, { isDeleted: false }],
      },
      {
        status: "active",
        comments: [{ isDeleted: true }, { isDeleted: false }],
      },
      {
        status: "active",
      },
      {
        status: "fixed",
        comments: [{ isDeleted: false }],
      },
    ]);

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "777",
        label: "PR #777",
        title: "Unresolved comments PR",
        status: "active",
        mergeStatus: "succeeded",
        approvalCount: 1,
        unresolvedCommentCount: 3,
        requiredReviewersApproved: true,
        requiredReviewersPendingCount: 0,
        isCompleted: false,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/777",
      },
    ]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequestThreads"),
    ).toHaveLength(1);
  });

  it("enriches active pull requests with approval count when reviewers approved", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with approvals",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f778",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/778", {
      pullRequestId: 778,
      title: "Approvals PR",
      status: "active",
      mergeStatus: "succeeded",
      reviewers: [
        { isRequired: true, vote: 10 },
        { isRequired: false, vote: 5 },
        { isRequired: false, vote: 0 },
      ],
    });

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "778",
        label: "PR #778",
        title: "Approvals PR",
        status: "active",
        mergeStatus: "succeeded",
        approvalCount: 2,
        requiredReviewersApproved: true,
        requiredReviewersPendingCount: 0,
        isCompleted: false,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/778",
      },
    ]);
  });

  it("ignores group reviewers when deriving approval count", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with group reviewer",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f779",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/779", {
      pullRequestId: 779,
      title: "Group reviewer PR",
      status: "active",
      mergeStatus: "succeeded",
      reviewers: [
        { isContainer: true, isRequired: true, vote: 10 },
        { isRequired: false, vote: 10 },
      ],
    });

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "779",
        label: "PR #779",
        title: "Group reviewer PR",
        status: "active",
        mergeStatus: "succeeded",
        approvalCount: 1,
        requiredReviewersApproved: true,
        requiredReviewersPendingCount: 0,
        isCompleted: false,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/779",
      },
    ]);
  });

  it("marks succeeded pull requests as not mergeable when required reviewers are pending", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with PR",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f321",
            attributes: {
              name: "Pull Request",
              title: "Gate blocked PR",
              status: "active",
              mergeStatus: "succeeded",
            },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/321", {
      pullRequestId: 321,
      title: "Gate blocked PR",
      status: "active",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 0 }],
    });

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "321",
        label: "PR #321",
        title: "Gate blocked PR",
        status: "active",
        mergeStatus: "succeeded",
        requiredReviewersApproved: false,
        requiredReviewersPendingCount: 1,
        isCompleted: false,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/321",
      },
    ]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequest"),
    ).toHaveLength(1);
  });

  it("captures failing blocking policy checks and ignores optional checks", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with failed checks",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f999",
            attributes: {
              name: "Pull Request",
              title: "Checks failing PR",
              status: "active",
              mergeStatus: "succeeded",
            },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/999", {
      pullRequestId: 999,
      codeReviewId: 123456,
      title: "Checks failing PR",
      status: "active",
      mergeStatus: "succeeded",
      artifactId: "vstfs:///Git/PullRequestId/project-1%2frepo-1%2f999",
      reviewers: [{ isRequired: true, vote: 0 }],
    });
    client.pullRequestPolicyEvaluations.set("vstfs:///CodeReview/CodeReviewId/project-1/999", [
      {
        status: "rejected",
        configuration: { isBlocking: true, isEnabled: true, type: { displayName: "CI Build" } },
      },
      {
        status: "rejected",
        configuration: {
          isBlocking: true,
          isEnabled: true,
          type: { displayName: "Require a merge strategy" },
        },
      },
      {
        status: "rejected",
        configuration: {
          isBlocking: false,
          isEnabled: true,
          type: { displayName: "Optional Lint" },
        },
      },
      {
        status: "broken",
        configuration: { isBlocking: true, isEnabled: true, type: { displayName: "Unit Tests" } },
      },
    ]);

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "999",
        label: "PR #999",
        title: "Checks failing PR",
        status: "active",
        mergeStatus: "succeeded",
        requiredReviewersApproved: false,
        requiredReviewersPendingCount: 1,
        failingStatusChecks: ["CI Build", "Unit Tests"],
        isCompleted: false,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/999",
      },
    ]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequestPolicyEvaluations"),
    ).toHaveLength(1);
    expect(
      client.callLog.find((call) => call.method === "getPullRequestPolicyEvaluations")?.args[0],
    ).toBe("vstfs:///CodeReview/CodeReviewId/project-1/999");
  });

  it("ignores require-a-merge-strategy policy when it is the only failed blocking policy", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with merge strategy policy",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f1002",
            attributes: {
              name: "Pull Request",
              title: "Merge strategy only",
              status: "active",
              mergeStatus: "succeeded",
            },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/1002", {
      pullRequestId: 1002,
      title: "Merge strategy only",
      status: "active",
      mergeStatus: "succeeded",
      artifactId: "vstfs:///Git/PullRequestId/project-1%2frepo-1%2f1002",
      reviewers: [{ isRequired: true, vote: 0 }],
    });
    client.pullRequestPolicyEvaluations.set("vstfs:///CodeReview/CodeReviewId/project-1/1002", [
      {
        status: "rejected",
        configuration: {
          isBlocking: true,
          isEnabled: true,
          type: { displayName: "Require a merge strategy" },
        },
      },
    ]);

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "1002",
      requiredReviewersApproved: false,
      requiredReviewersPendingCount: 1,
    });
    expect(result.workItems[0].relatedPullRequests?.[0].failingStatusChecks).toBeUndefined();
  });

  it("falls back to repository project id for policy artifact when PR artifactId is missing", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with policy fallback",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f1001",
            attributes: {
              name: "Pull Request",
              title: "Fallback policy PR",
              status: "active",
              mergeStatus: "succeeded",
            },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/1001", {
      pullRequestId: 1001,
      title: "Fallback policy PR",
      status: "active",
      mergeStatus: "succeeded",
      repository: {
        project: {
          id: "project-fallback",
        },
      },
      reviewers: [{ isRequired: true, vote: 0 }],
    });
    client.pullRequestPolicyEvaluations.set(
      "vstfs:///CodeReview/CodeReviewId/project-fallback/1001",
      [
        {
          status: "rejected",
          configuration: {
            isBlocking: true,
            isEnabled: true,
            type: { displayName: "Build Validation" },
          },
        },
      ],
    );

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "1001",
      failingStatusChecks: ["Build Validation"],
    });
    expect(
      client.callLog.find((call) => call.method === "getPullRequestPolicyEvaluations")?.args[0],
    ).toBe("vstfs:///CodeReview/CodeReviewId/project-fallback/1001");
  });

  it("still enriches when title/status exist but merge status is missing", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with PR",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f123",
            attributes: {
              name: "Pull Request",
              title: "Improve login flow",
              status: "active",
            },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/123", {
      pullRequestId: 123,
      title: "Improve login flow",
      status: "active",
      mergeStatus: "conflicts",
    });

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    expect(result.workItems[0].relatedPullRequests).toEqual([
      {
        id: "123",
        label: "PR #123",
        title: "Improve login flow",
        status: "active",
        mergeStatus: "conflicts",
        isCompleted: false,
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/123",
      },
    ]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequest"),
    ).toHaveLength(1);
  });

  it("stops retrying pull request enrichment after first lookup failure", async () => {
    const client = new MockAdoClient();
    client.shouldFailPullRequest = true;
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with blocked PR API",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f123",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];

    const first = await fetchWorkItemsInitial(client, "Active", "org", "proj");
    const second = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(first.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "123",
      label: "PR #123",
    });
    expect(second.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "123",
      label: "PR #123",
    });
    expect(
      client.callLog.filter((call) => call.method === "getPullRequest"),
    ).toHaveLength(1);
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

  it("refreshes active pull request status for unchanged work items", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 2, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 2,
        fields: {
          "System.Id": 2,
          "System.Rev": 1,
          "System.Title": "Story with stale PR",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
        },
      }),
    ];
    client.pullRequests.set("repo-1/123", {
      pullRequestId: 123,
      title: "Story PR",
      status: "active",
      mergeStatus: "succeeded",
      artifactId: "vstfs:///Git/PullRequestId/project-1%2frepo-1%2f123",
      reviewers: [{ isRequired: true, vote: 0 }],
    });
    client.pullRequestPolicyEvaluations.set("vstfs:///CodeReview/CodeReviewId/project-1/123", [
      {
        status: "rejected",
        configuration: { isBlocking: true, isEnabled: true, type: { displayName: "CI Build" } },
      },
      {
        status: "rejected",
        configuration: {
          isBlocking: false,
          isEnabled: true,
          type: { displayName: "Optional Lint" },
        },
      },
    ]);

    const cachedRevMap = new Map([[2, { rev: 1 }]]);
    const cachedItems = [
      {
        id: 2,
        title: "Story with stale PR",
        type: "User Story",
        state: "Active",
        rev: 1,
        url: "https://dev.azure.com/org/proj/_workitems/edit/2",
        relatedPullRequests: [
          {
            id: "123",
            label: "PR #123",
            title: "Story PR",
            status: "active",
            mergeStatus: "succeeded",
            requiredReviewersApproved: false,
            requiredReviewersPendingCount: 1,
            url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/123",
          },
        ],
      },
    ];

    const result = await fetchWorkItemsDelta(
      client,
      "Active",
      "org",
      "proj",
      cachedRevMap,
      cachedItems,
    );

    expect(result.workItems).toHaveLength(1);
    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "123",
      mergeStatus: "succeeded",
      requiredReviewersApproved: false,
      requiredReviewersPendingCount: 1,
      failingStatusChecks: ["CI Build"],
    });
    expect(
      client.callLog.filter((call) => call.method === "getPullRequest"),
    ).toHaveLength(1);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequestPolicyEvaluations"),
    ).toHaveLength(1);
  });

  it("drops changed items that became removed instead of keeping cached values", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Rev": 2,
          "System.Title": "Removed item",
          "System.WorkItemType": "Task",
          "System.State": "Removed",
        },
      }),
    ];

    const cachedRevMap = new Map([[1, { rev: 1 }]]);
    const cachedItems = [
      { id: 1, title: "Still cached", type: "Task", state: "Active", rev: 1, url: "" },
    ];

    const result = await fetchWorkItemsDelta(
      client,
      "Active",
      "org",
      "proj",
      cachedRevMap,
      cachedItems,
    );

    expect(result.workItems).toEqual([]);
    expect(result.revMap.size).toBe(0);
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

  it("filters removed items from candidate results", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }, { id: 2, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Candidate",
          "System.WorkItemType": "Task",
          "System.State": "New",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 2,
        fields: {
          "System.Id": 2,
          "System.Title": "Removed candidate",
          "System.WorkItemType": "Task",
          "System.State": "Removed",
          "System.Rev": 2,
        },
      }),
    ];

    const items = await fetchCandidateWorkItems(client, "New", "org", "proj");

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(1);
  });

  it("queries grouped candidate states by work item type", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [] };

    await fetchCandidateWorkItems(
      client,
      "Approved",
      "org",
      "proj",
      "",
      "Bug, User Story",
      "Bug=New; User Story=Approved",
    );

    expect(client.callLog[0]?.method).toBe("queryWorkItems");
    const wiql = client.callLog[0]?.args[0];
    expect(wiql).toContain("[System.State] = 'New'");
    expect(wiql).toContain("[System.State] = 'Approved'");
    expect(wiql).toContain("[System.WorkItemType] IN ('Bug')");
    expect(wiql).toContain("[System.WorkItemType] IN ('User Story')");
  });

  it("queries candidates by board column when board config is provided", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [] };

    await fetchCandidateWorkItems(
      client,
      "",
      "org",
      "proj",
      "",
      "Bug, User Story",
      "",
      {
        team: "My Team",
        boardId: "board-1",
        boardName: "Stories",
        intakeColumnName: "New",
        intakeColumnIsSplit: true,
        columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
        doneFieldReferenceName: "WEF_FAKE_Kanban.Column.Done",
        intakeStateMappings: {
          Bug: "New",
          "User Story": "Approved",
        },
      },
    );

    const wiql = client.callLog[0]?.args[0];
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'New'");
    expect(wiql).toContain("[System.AssignedTo] = ''");
    expect(wiql).toContain("[System.WorkItemType] IN ('Bug', 'User Story')");
  });
});

describe("fetchCompletedWorkItems", () => {
  it("filters removed items from completed results", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }, { id: 2, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Completed",
          "System.WorkItemType": "Bug",
          "System.State": "Resolved",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 2,
        fields: {
          "System.Id": 2,
          "System.Title": "Removed completed",
          "System.WorkItemType": "Bug",
          "System.State": "Removed",
          "System.Rev": 2,
        },
      }),
    ];

    const items = await fetchCompletedWorkItems(client, "Resolved", "org", "proj");

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(1);
  });

  it("queries completed items by board column when configured", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [] };

    await fetchCompletedWorkItems(
      client,
      "Resolved",
      "org",
      "proj",
      "",
      "Bug",
      "Approved",
      {
        team: "My Team",
        boardId: "board-1",
        boardName: "Stories",
        intakeColumnName: "Incoming",
        intakeColumnIsSplit: false,
        columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
        intakeStateMappings: {},
        boardColumnsByName: {
          approved: {
            isSplit: false,
            stateMappings: {
              Bug: "Resolved",
            },
          },
        },
      },
    );

    const wiql = client.callLog[0]?.args[0];
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'Approved'");
    expect(wiql).toContain("[System.AssignedTo] = @Me");
    expect(wiql).toContain("[System.WorkItemType] IN ('Bug')");
  });

  it("queries completed items by split board column on the active side", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [] };

    await fetchCompletedWorkItems(
      client,
      "Resolved",
      "org",
      "proj",
      "",
      "Bug",
      "Approved",
      {
        team: "My Team",
        boardId: "board-1",
        boardName: "Stories",
        intakeColumnName: "Incoming",
        intakeColumnIsSplit: false,
        columnFieldReferenceName: "WEF_FAKE_Kanban.Column",
        doneFieldReferenceName: "WEF_FAKE_Kanban.Column.Done",
        intakeStateMappings: {},
        boardColumnsByName: {
          approved: {
            isSplit: true,
            stateMappings: {
              Bug: "Resolved",
            },
          },
        },
      },
    );

    const wiql = client.callLog[0]?.args[0];
    expect(wiql).toContain("[WEF_FAKE_Kanban.Column] = 'Approved'");
    expect(wiql).toContain("[System.AssignedTo] = @Me");
  });
});
