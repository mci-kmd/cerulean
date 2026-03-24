import { describe, it, expect } from "vitest";
import {
  mapAdoWorkItem,
  fetchWorkItemsInitial,
  fetchWorkItemsDelta,
  fetchCompletedWorkItems,
  fetchUiReviewWorkItems,
  fetchCandidateWorkItems,
  fetchReviewWorkItems,
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
    client.builds = [
      {
        id: 901,
        buildNumber: "#20260320.4 • Merged PR 123: Improve login flow",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 10, name: "CI" },
      },
      {
        id: 902,
        buildNumber: "#20260320.5 • Merged PR 123: Improve login flow",
        status: "inProgress",
        sourceBranch: "refs/heads/master",
        definition: { id: 11, name: "Deploy" },
      },
      {
        id: 903,
        buildNumber: "#20260320.3 • Merged PR 123: Improve login flow",
        status: "completed",
        result: "failed",
        sourceBranch: "refs/heads/master",
        definition: { id: 10, name: "CI" },
      },
    ];
    client.releasesByBuildId.set("20260320.4", [
      {
        id: 81,
        name: "Release-81",
        webAccessUri: "https://dev.azure.com/org/proj/_release?releaseId=81&_a=release-summary",
        environments: [
          { id: 5, name: "DEV", status: "succeeded" },
          { id: 6, name: "PROD", status: "pendingApproval" },
        ],
      },
    ]);

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
        mergedBuildSummary: {
          totalCount: 2,
          completedCount: 1,
          failedCount: 0,
          builds: [
            { pipeline: "CI", buildId: "20260320.4", status: "Succeeded" },
            { pipeline: "Deploy", buildId: "20260320.5", status: "In Progress" },
          ],
        },
        mergedReleaseSummary: {
          totalCount: 1,
          inProgressCount: 1,
          deployedCount: 1,
          releases: [
            {
              pipeline: "CI",
              buildId: "20260320.4",
              status: "Deployed to DEV; PROD in progress",
              inProgressEnvironment: "PROD",
              deployedEnvironment: "DEV",
              url: "https://dev.azure.com/org/proj/_release?releaseId=81&_a=release-summary",
            },
          ],
        },
        url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/123",
      },
    ]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequest"),
    ).toHaveLength(1);
    expect(client.callLog.filter((call) => call.method === "listBuilds")).toHaveLength(1);
    expect(
      client.callLog.filter((call) => call.method === "listReleasesForBuild"),
    ).toHaveLength(1);
    expect(
      client.callLog.find((call) => call.method === "listReleasesForBuild")?.args,
    ).toEqual(["901", "20260320.4"]);
    expect(
      client.callLog.filter((call) => call.method === "getPullRequestThreads"),
    ).toHaveLength(0);
  });

  it("stores a checked empty merged build summary when no master builds match a completed PR", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with completed PR",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f124",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/124", {
      pullRequestId: 124,
      title: "Improve logout flow",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 904,
        buildNumber: "#20260320.6 • Merged PR 999: Other work",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 12, name: "CI" },
      },
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "124",
      mergedBuildSummary: null,
      mergedReleaseSummary: null,
    });
    expect(client.callLog.filter((call) => call.method === "listBuilds")).toHaveLength(1);
  });

  it("matches releases from recent release artifact metadata when filtered lookup misses", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with recent release match",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f126",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/126", {
      pullRequestId: 126,
      title: "Match recent release",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 906,
        buildNumber: "#20260324.4 • Merged PR 126: Match recent release",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 13, name: "CI" },
      },
    ];
    client.releases = [
      {
        id: 91,
        name: "Release-91",
        artifacts: [
          {
            type: "Build",
            definitionReference: {
              version: { id: "some-other-id", name: "20260324.4" },
            },
          },
        ],
        environments: [
          { id: 9, name: "DEV", status: "succeeded" },
          { id: 10, name: "PROD", status: "pendingApproval" },
        ],
        webAccessUri: "https://dev.azure.com/org/proj/_release?releaseId=91&_a=release-summary",
      },
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "126",
      mergedReleaseSummary: {
        totalCount: 1,
        inProgressCount: 1,
        deployedCount: 1,
        releases: [
          {
            pipeline: "CI",
            buildId: "20260324.4",
            status: "Deployed to DEV; PROD in progress",
            inProgressEnvironment: "PROD",
            deployedEnvironment: "DEV",
            url: "https://dev.azure.com/org/proj/_release?releaseId=91&_a=release-summary",
          },
        ],
      },
    });
    expect(
      client.callLog.filter((call) => call.method === "listRecentReleases"),
    ).toHaveLength(1);
  });

  it("keeps only the newest merged build status per pipeline when retries exist", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with retried merged build",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f127",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/127", {
      pullRequestId: 127,
      title: "Retry flaky merged build",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 910,
        buildNumber: "#20260320.10 • Merged PR 127: Retry flaky merged build",
        queueTime: "2026-03-20T10:00:00.000Z",
        status: "completed",
        result: "failed",
        sourceBranch: "refs/heads/master",
        definition: { id: 18, name: "CI" },
      },
      {
        id: 912,
        buildNumber: "#20260320.12 • Merged PR 127: Retry flaky merged build",
        queueTime: "2026-03-20T11:00:00.000Z",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 18, name: "CI" },
      },
      {
        id: 911,
        buildNumber: "#20260320.11 • Merged PR 127: Retry flaky merged build",
        queueTime: "2026-03-20T10:30:00.000Z",
        status: "inProgress",
        sourceBranch: "refs/heads/master",
        definition: { id: 19, name: "Deploy" },
      },
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "127",
      mergedBuildSummary: {
        totalCount: 2,
        completedCount: 1,
        failedCount: 0,
        builds: [
          { pipeline: "CI", buildId: "20260320.12", status: "Succeeded" },
          { pipeline: "Deploy", buildId: "20260320.11", status: "In Progress" },
        ],
      },
    });
  });

  it("matches merged PR builds from trigger info when buildNumber lacks the merge message", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with completed PR",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f125",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/125", {
      pullRequestId: 125,
      title: "Improve sign out",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 905,
        buildNumber: "#20260320.7",
        appendCommitMessageToRunName: true,
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 15, name: "CI" },
        triggerInfo: {
          "ci.message": "Merged PR 125: Improve sign out",
        },
      },
      {
        id: 906,
        buildNumber: "#20260320.8",
        appendCommitMessageToRunName: true,
        status: "inProgress",
        sourceBranch: "refs/heads/master",
        definition: { id: 16, name: "Deploy" },
        triggerInfo: {
          "ci.message": "Merged PR 125: Improve sign out",
        },
      },
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "125",
      mergedBuildSummary: {
        totalCount: 2,
        completedCount: 1,
        failedCount: 0,
        builds: [
          { pipeline: "CI", buildId: "20260320.7", status: "Succeeded" },
          { pipeline: "Deploy", buildId: "20260320.8", status: "In Progress" },
        ],
      },
    });
  });

  it("treats partially succeeded merged builds as successful summaries", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 1, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 1,
        fields: {
          "System.Id": 1,
          "System.Title": "Story with partially succeeded build",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%2frepo-1%2f126",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/126", {
      pullRequestId: 126,
      title: "Improve registration",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 907,
        buildNumber: "#20260320.9 • Merged PR 126: Improve registration",
        status: "completed",
        result: "partiallySucceeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 17, name: "CI" },
      },
    ];

    const result = await fetchWorkItemsInitial(client, "Active", "org", "proj");

    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "126",
      mergedBuildSummary: {
        totalCount: 1,
        completedCount: 1,
        failedCount: 0,
        builds: [{ pipeline: "CI", buildId: "20260320.9", status: "Partially Succeeded" }],
      },
    });
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

describe("fetchUiReviewWorkItems", () => {
  it("maps tagged work items into virtual ui review tasks", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = {
      workItems: [{ id: 51, url: "" }, { id: 52, url: "" }, { id: 53, url: "" }],
    };
    client.workItems = [
      createAdoWorkItem({
        id: 51,
        fields: {
          "System.Id": 51,
          "System.Title": "Review the login polish",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.Rev": 2,
          "System.Tags": "Backend; UI Review",
        },
      }),
      createAdoWorkItem({
        id: 52,
        fields: {
          "System.Id": 52,
          "System.Title": "Substring only",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.Rev": 1,
          "System.Tags": "UI Reviewer",
        },
      }),
      createAdoWorkItem({
        id: 53,
        fields: {
          "System.Id": 53,
          "System.Title": "Removed item",
          "System.WorkItemType": "Bug",
          "System.State": "Removed",
          "System.Rev": 1,
          "System.Tags": "UI Review",
        },
      }),
    ];

    const result = await fetchUiReviewWorkItems(
      client,
      "org",
      "proj",
      "UI Review",
      "Area\\Team",
      "Bug",
    );

    expect(client.callLog[0]?.args[0]).toContain("[System.Tags] CONTAINS 'UI Review'");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      displayId: 51,
      title: "Review the login polish",
      type: "Task",
      kind: "ui-review",
      uiReview: {
        sourceWorkItemId: 51,
        reviewTag: "UI Review",
      },
    });
    expect(result[0]?.id).toBeLessThan(0);
    expect(result[0]?.url).toBe("https://dev.azure.com/test-org/test-project/_workitems/edit/51");
    expect(result[0]?.relatedPullRequests).toBeUndefined();
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

  it("refreshes completed PR build counts for unchanged work items", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 7, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 7,
        fields: {
          "System.Id": 7,
          "System.Rev": 1,
          "System.Title": "Story with merged PR builds",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
        },
      }),
    ];
    client.pullRequests.set("repo-1/315", {
      pullRequestId: 315,
      title: "Merged signup flow",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 1001,
        buildNumber: "#20260320.7 • Merged PR 315: Merged signup flow",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 31, name: "CI" },
      },
      {
        id: 1002,
        buildNumber: "#20260320.8 • Merged PR 315: Merged signup flow",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 32, name: "Deploy" },
      },
      {
        id: 1003,
        buildNumber: "#20260320.9 • Merged PR 315: Merged signup flow",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 33, name: "Smoke" },
      },
    ];

    const cachedRevMap = new Map([[7, { rev: 1 }]]);
    const cachedItems = [
      {
        id: 7,
        title: "Story with merged PR builds",
        type: "User Story",
        state: "Active",
        rev: 1,
        url: "https://dev.azure.com/org/proj/_workitems/edit/7",
        relatedPullRequests: [
          {
            id: "315",
            label: "PR #315",
            title: "Merged signup flow",
            status: "completed",
            mergeStatus: "succeeded",
            requiredReviewersApproved: true,
            requiredReviewersPendingCount: 0,
            isCompleted: true,
            mergedBuildSummary: {
              totalCount: 3,
              completedCount: 0,
              failedCount: 0,
              builds: [
                { pipeline: "CI", buildId: "20260320.7", status: "In Progress" },
                { pipeline: "Deploy", buildId: "20260320.8", status: "In Progress" },
                { pipeline: "Smoke", buildId: "20260320.9", status: "In Progress" },
              ],
            },
            url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/315",
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

    expect(result.workItems[0].relatedPullRequests?.[0]).toMatchObject({
      id: "315",
      mergedBuildSummary: {
        totalCount: 3,
        completedCount: 3,
        failedCount: 0,
        builds: [
          { pipeline: "CI", buildId: "20260320.7", status: "Succeeded" },
          { pipeline: "Deploy", buildId: "20260320.8", status: "Succeeded" },
          { pipeline: "Smoke", buildId: "20260320.9", status: "Succeeded" },
        ],
      },
    });
    expect(
      client.callLog.filter((call) => call.method === "listBuilds"),
    ).toHaveLength(1);
  });

  it("refreshes completed PR build details when summary counts stay the same", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 8, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 8,
        fields: {
          "System.Id": 8,
          "System.Rev": 1,
          "System.Title": "Story with retried merged build",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
        },
      }),
    ];
    client.pullRequests.set("repo-1/316", {
      pullRequestId: 316,
      title: "Retry deploy",
      status: "completed",
      mergeStatus: "succeeded",
      reviewers: [{ isRequired: true, vote: 10 }],
    });
    client.builds = [
      {
        id: 1011,
        buildNumber: "#20260320.10 • Merged PR 316: Retry deploy",
        status: "completed",
        result: "succeeded",
        sourceBranch: "refs/heads/master",
        definition: { id: 41, name: "CI" },
      },
      {
        id: 1013,
        buildNumber: "#20260320.12 • Merged PR 316: Retry deploy",
        queueTime: "2026-03-20T12:00:00.000Z",
        status: "inProgress",
        sourceBranch: "refs/heads/master",
        definition: { id: 42, name: "Deploy" },
      },
      {
        id: 1012,
        buildNumber: "#20260320.11 • Merged PR 316: Retry deploy",
        queueTime: "2026-03-20T11:00:00.000Z",
        status: "inProgress",
        sourceBranch: "refs/heads/master",
        definition: { id: 42, name: "Deploy" },
      },
    ];

    const cachedRevMap = new Map([[8, { rev: 1 }]]);
    const cachedItems = [
      {
        id: 8,
        title: "Story with retried merged build",
        type: "User Story",
        state: "Active",
        rev: 1,
        url: "https://dev.azure.com/org/proj/_workitems/edit/8",
        relatedPullRequests: [
          {
            id: "316",
            label: "PR #316",
            title: "Retry deploy",
            status: "completed",
            mergeStatus: "succeeded",
            requiredReviewersApproved: true,
            requiredReviewersPendingCount: 0,
            isCompleted: true,
            mergedBuildSummary: {
              totalCount: 2,
              completedCount: 1,
              failedCount: 0,
              builds: [
                { pipeline: "CI", buildId: "20260320.10", status: "Succeeded" },
                { pipeline: "Deploy", buildId: "20260320.11", status: "In Progress" },
              ],
            },
            url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/316",
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

    expect(result.workItems[0].relatedPullRequests?.[0]?.mergedBuildSummary?.builds).toEqual([
      { pipeline: "CI", buildId: "20260320.10", status: "Succeeded" },
      { pipeline: "Deploy", buildId: "20260320.12", status: "In Progress" },
    ]);
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

  it("skips PR build-status lookups for completed items", async () => {
    const client = new MockAdoClient();
    client.wiqlResult = { workItems: [{ id: 80, url: "" }] };
    client.workItems = [
      createAdoWorkItem({
        id: 80,
        fields: {
          "System.Id": 80,
          "System.Title": "Completed shipping item",
          "System.WorkItemType": "Bug",
          "System.State": "Resolved",
          "System.Rev": 1,
        },
        relations: [
          {
            rel: "ArtifactLink",
            url: "https://dev.azure.com/org/proj/_git/repo-1/pullrequest/8800",
            attributes: { name: "Pull Request" },
          },
        ],
      }),
    ];
    client.pullRequests.set("repo-1/8800", {
      pullRequestId: 8800,
      title: "Completed shipping PR",
      status: "completed",
      mergeStatus: "succeeded",
      repository: {
        id: "repo-1",
        project: { id: "proj-1" },
      },
    });

    const items = await fetchCompletedWorkItems(client, "Resolved", "org", "proj");

    expect(items[0]?.relatedPullRequests?.[0]).toMatchObject({
      id: "8800",
      title: "Completed shipping PR",
      status: "completed",
      mergeStatus: "succeeded",
    });
    expect(client.callLog.filter((call) => call.method === "getPullRequest")).toHaveLength(1);
    expect(client.callLog.filter((call) => call.method === "getPullRequestPolicyEvaluations")).toHaveLength(0);
    expect(client.callLog.filter((call) => call.method === "getPullRequestThreads")).toHaveLength(0);
    expect(client.callLog.filter((call) => call.method === "listBuilds")).toHaveLength(0);
  });
});

describe("fetchReviewWorkItems", () => {
  it("creates review items for other dev PRs and buckets them by review state", async () => {
    const client = new MockAdoClient();
    client.myEmail = "me@test.com";
    client.myUserId = "me-id";
    client.pullRequests.set("repo-1/7001", {
      pullRequestId: 7001,
      title: "Review login flow",
      status: "active",
      mergeStatus: "succeeded",
      createdBy: {
        id: "other-id",
        uniqueName: "other@test.com",
      },
      repository: {
        id: "repo-1",
        project: {
          id: "proj-1",
        },
      },
      reviewers: [
        { id: "lead-id", uniqueName: "lead@test.com", vote: 5 },
        { id: "me-id", uniqueName: "me@test.com", vote: 10 },
      ],
    });
    client.pullRequests.set("repo-2/7002", {
      pullRequestId: 7002,
      title: "Review checkout flow",
      status: "active",
      mergeStatus: "succeeded",
      createdBy: {
        id: "other-id-2",
        uniqueName: "other-2@test.com",
      },
      repository: {
        id: "repo-2",
        project: {
          id: "proj-1",
        },
      },
      reviewers: [{ id: "lead-id", uniqueName: "lead@test.com", vote: 0 }],
    });
    client.pullRequests.set("repo-3/7003", {
      pullRequestId: 7003,
      title: "My own PR",
      status: "active",
      createdBy: {
        id: "me-id",
        uniqueName: "me@test.com",
      },
      repository: {
        id: "repo-3",
        project: {
          id: "proj-1",
        },
      },
      reviewers: [],
    });
    client.pullRequestWorkItems.set("repo-1/7001", [{ id: "42", url: "" }]);
    client.pullRequestWorkItems.set("repo-2/7002", [{ id: "43", url: "" }]);
    client.pullRequestWorkItems.set("repo-3/7003", [{ id: "44", url: "" }]);
    client.pullRequestThreads.set("repo-1/7001", [{ status: "active" }]);
    client.pullRequestThreads.set("repo-2/7002", [{ status: "active" }, { status: "fixed" }]);
    client.workItems = [
      createAdoWorkItem({
        id: 42,
        fields: {
          "System.Id": 42,
          "System.Title": "Login bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 43,
        fields: {
          "System.Id": 43,
          "System.Title": "Checkout story",
          "System.WorkItemType": "User Story",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 44,
        fields: {
          "System.Id": 44,
          "System.Title": "Excluded own PR item",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
    ];

    const result = await fetchReviewWorkItems(
      client,
      "org",
      "proj",
      "Area",
      "Bug, User Story",
    );

    expect(result.workItems).toHaveLength(2);

    const completedReview = result.workItems.find(
      (item) => item.review?.pullRequestId === 7001,
    );
    expect(completedReview).toMatchObject({
      displayId: 42,
      kind: "review",
      review: {
        repositoryId: "repo-1",
        pullRequestId: 7001,
        reviewState: "completed",
      },
    });
    expect(completedReview?.relatedPullRequests?.[0]).toMatchObject({
      id: "7001",
      title: "Review login flow",
      reviewerCount: 2,
      unresolvedCommentCount: 1,
    });
    expect(result.completedIds.has(completedReview!.id)).toBe(true);

    const newReview = result.workItems.find((item) => item.review?.pullRequestId === 7002);
    expect(newReview).toMatchObject({
      displayId: 43,
      kind: "review",
      review: {
        repositoryId: "repo-2",
        pullRequestId: 7002,
        reviewState: "new",
      },
    });
    expect(newReview?.relatedPullRequests?.[0]).toMatchObject({
      id: "7002",
      title: "Review checkout flow",
      reviewerCount: 1,
      unresolvedCommentCount: 1,
    });
    expect(result.newWorkIds.has(newReview!.id)).toBe(true);
  });

  it("filters review items by area path and configured work item types", async () => {
    const client = new MockAdoClient();
    client.pullRequests.set("repo-1/7100", {
      pullRequestId: 7100,
      title: "Area scoped PR",
      status: "active",
      createdBy: {
        id: "other-id",
        uniqueName: "other@test.com",
      },
      repository: {
        id: "repo-1",
        project: {
          id: "proj-1",
        },
      },
      reviewers: [],
    });
    client.pullRequestWorkItems.set("repo-1/7100", [
      { id: "50", url: "" },
      { id: "51", url: "" },
    ]);
    client.workItems = [
      createAdoWorkItem({
        id: 50,
        fields: {
          "System.Id": 50,
          "System.Title": "Included bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 51,
        fields: {
          "System.Id": 51,
          "System.Title": "Wrong type task",
          "System.WorkItemType": "Task",
          "System.State": "Active",
          "System.AreaPath": "OtherArea",
          "System.Rev": 1,
        },
      }),
    ];

    const result = await fetchReviewWorkItems(client, "org", "proj", "Area", "Bug");

    expect(result.workItems).toHaveLength(1);
    expect(result.workItems[0]).toMatchObject({
      displayId: 50,
      title: "Included bug",
    });
  });

  it("excludes completed and draft PRs from review items", async () => {
    const client = new MockAdoClient();
    client.myEmail = "me@test.com";
    client.myUserId = "me-id";
    client.pullRequests.set("repo-1/7200", {
      pullRequestId: 7200,
      title: "Closed PR",
      status: "completed",
      createdBy: {
        id: "other-id",
        uniqueName: "other@test.com",
      },
      repository: {
        id: "repo-1",
        project: {
          id: "proj-1",
        },
      },
      reviewers: [{ id: "me-id", uniqueName: "me@test.com", vote: 0 }],
    });
    client.pullRequests.set("repo-2/7201", {
      pullRequestId: 7201,
      title: "Draft PR",
      status: "active",
      isDraft: true,
      createdBy: {
        id: "other-id-2",
        uniqueName: "other-2@test.com",
      },
      repository: {
        id: "repo-2",
        project: {
          id: "proj-1",
        },
      },
      reviewers: [{ id: "me-id", uniqueName: "me@test.com", vote: 0 }],
    });
    client.pullRequestWorkItems.set("repo-1/7200", [{ id: "60", url: "" }]);
    client.pullRequestWorkItems.set("repo-2/7201", [{ id: "61", url: "" }]);
    client.workItems = [
      createAdoWorkItem({
        id: 60,
        fields: {
          "System.Id": 60,
          "System.Title": "Visible review bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 61,
        fields: {
          "System.Id": 61,
          "System.Title": "Hidden draft bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
    ];

    const result = await fetchReviewWorkItems(client, "org", "proj", "Area", "Bug");

    expect(client.callLog.find((call) => call.method === "listPullRequests")?.args[0]).toBe("active");
    expect(result.workItems).toHaveLength(0);
    expect(result.newWorkIds.size).toBe(0);
    expect(result.completedIds.size).toBe(0);
  });

  it("only fetches build-status policy data for active review cards", async () => {
    const client = new MockAdoClient();
    client.myEmail = "me@test.com";
    client.myUserId = "me-id";
    client.pullRequests.set("repo-1/7300", {
      pullRequestId: 7300,
      title: "Active review PR",
      status: "active",
      mergeStatus: "rejectedByPolicy",
      createdBy: {
        id: "other-id-1",
        uniqueName: "other-1@test.com",
      },
      repository: {
        id: "repo-1",
        project: { id: "proj-1" },
      },
      reviewers: [{ id: "me-id", uniqueName: "me@test.com", vote: 0, isRequired: true }],
    });
    client.pullRequests.set("repo-2/7301", {
      pullRequestId: 7301,
      title: "Completed review PR",
      status: "active",
      mergeStatus: "rejectedByPolicy",
      createdBy: {
        id: "other-id-2",
        uniqueName: "other-2@test.com",
      },
      repository: {
        id: "repo-2",
        project: { id: "proj-1" },
      },
      reviewers: [{ id: "me-id", uniqueName: "me@test.com", vote: 10, isRequired: true }],
    });
    client.pullRequests.set("repo-3/7302", {
      pullRequestId: 7302,
      title: "New review PR",
      status: "active",
      mergeStatus: "rejectedByPolicy",
      createdBy: {
        id: "other-id-3",
        uniqueName: "other-3@test.com",
      },
      repository: {
        id: "repo-3",
        project: { id: "proj-1" },
      },
      reviewers: [{ id: "lead-id", uniqueName: "lead@test.com", vote: 0, isRequired: true }],
    });
    client.pullRequestWorkItems.set("repo-1/7300", [{ id: "70", url: "" }]);
    client.pullRequestWorkItems.set("repo-2/7301", [{ id: "71", url: "" }]);
    client.pullRequestWorkItems.set("repo-3/7302", [{ id: "72", url: "" }]);
    client.pullRequestPolicyEvaluations.set("vstfs:///CodeReview/CodeReviewId/proj-1/7300", [
      {
        status: "rejected",
        configuration: {
          isBlocking: true,
          isEnabled: true,
          type: { displayName: "CI Build" },
        },
      },
    ]);
    client.workItems = [
      createAdoWorkItem({
        id: 70,
        fields: {
          "System.Id": 70,
          "System.Title": "Active review bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 71,
        fields: {
          "System.Id": 71,
          "System.Title": "Completed review bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
      createAdoWorkItem({
        id: 72,
        fields: {
          "System.Id": 72,
          "System.Title": "New review bug",
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.AreaPath": "Area\\Team",
          "System.Rev": 1,
        },
      }),
    ];

    const result = await fetchReviewWorkItems(client, "org", "proj", "Area", "Bug");

    const activeReview = result.workItems.find((item) => item.review?.pullRequestId === 7300);
    const completedReview = result.workItems.find((item) => item.review?.pullRequestId === 7301);
    const newReview = result.workItems.find((item) => item.review?.pullRequestId === 7302);

    expect(activeReview?.review?.reviewState).toBe("active");
    expect(activeReview?.relatedPullRequests?.[0].failingStatusChecks).toEqual(["CI Build"]);
    expect(completedReview?.review?.reviewState).toBe("completed");
    expect(completedReview?.relatedPullRequests?.[0].failingStatusChecks).toBeUndefined();
    expect(newReview?.review?.reviewState).toBe("new");
    expect(newReview?.relatedPullRequests?.[0].failingStatusChecks).toBeUndefined();
    expect(client.callLog.filter((call) => call.method === "getPullRequestPolicyEvaluations")).toHaveLength(1);
    expect(
      client.callLog.find((call) => call.method === "getPullRequestPolicyEvaluations")?.args[0],
    ).toBe("vstfs:///CodeReview/CodeReviewId/proj-1/7300");
  });
});
