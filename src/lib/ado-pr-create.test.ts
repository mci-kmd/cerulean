import { describe, expect, it, vi } from "vitest";
import { MockAdoClient } from "@/api/ado-client.mock";
import {
  buildAdoPullRequestCreateUrl,
  findAdoPullRequestCreateCandidates,
  getShortBranchName,
  openAdoPullRequestCreate,
} from "./ado-pr-create";

describe("ado-pr-create", () => {
  it("strips the refs heads prefix from branch names", () => {
    expect(getShortBranchName("refs/heads/1234-fix-login")).toBe("1234-fix-login");
    expect(getShortBranchName("branch-name")).toBe("branch-name");
  });

  it("builds an ADO PR-create URL with source and target refs", () => {
    expect(
      buildAdoPullRequestCreateUrl(
        "my org",
        "my project",
        "repo-1",
        "Repo.One",
        "refs/heads/1234-fix-login",
        "refs/heads/main",
      ),
    ).toBe(
      "https://dev.azure.com/my%20org/my%20project/_git/Repo.One/pullrequestcreate?sourceRef=1234-fix-login&targetRef=main&sourceRepositoryId=repo-1&targetRepositoryId=repo-1",
    );
  });

  it("finds matching source branches across repos using each repo default branch", async () => {
    const client = new MockAdoClient();
    client.repositories = [
      { id: "repo-2", name: "Repo B", defaultBranch: "refs/heads/master" },
      { id: "repo-1", name: "Repo A", defaultBranch: "refs/heads/main" },
      { id: "repo-3", name: "Repo No Default" },
    ];
    client.refs.set("repo-1", [
      { name: "refs/heads/1234-fix-login" },
      { name: "refs/heads/9999-other" },
    ]);
    client.refs.set("repo-2", [{ name: "refs/heads/1234-add-tests" }]);
    client.refs.set("repo-3", [{ name: "refs/heads/1234-unused" }]);

    const candidates = await findAdoPullRequestCreateCandidates({
      client,
      org: "test-org",
      project: "test project",
      workItemId: 1234,
    });

    expect(candidates).toEqual([
      {
        repositoryId: "repo-1",
        repositoryName: "Repo A",
        sourceRefName: "refs/heads/1234-fix-login",
        sourceBranchName: "1234-fix-login",
        targetRefName: "refs/heads/main",
        targetBranchName: "main",
        url: "https://dev.azure.com/test-org/test%20project/_git/Repo%20A/pullrequestcreate?sourceRef=1234-fix-login&targetRef=main&sourceRepositoryId=repo-1&targetRepositoryId=repo-1",
      },
      {
        repositoryId: "repo-2",
        repositoryName: "Repo B",
        sourceRefName: "refs/heads/1234-add-tests",
        sourceBranchName: "1234-add-tests",
        targetRefName: "refs/heads/master",
        targetBranchName: "master",
        url: "https://dev.azure.com/test-org/test%20project/_git/Repo%20B/pullrequestcreate?sourceRef=1234-add-tests&targetRef=master&sourceRepositoryId=repo-2&targetRepositoryId=repo-2",
      },
    ]);
    expect(client.callLog).toContainEqual({ method: "listRepositories", args: [] });
    expect(client.callLog).toContainEqual({ method: "listRefs", args: ["repo-1", "heads/1234"] });
    expect(client.callLog).toContainEqual({ method: "listRefs", args: ["repo-2", "heads/1234"] });
  });

  it("copies the work item id, prompts when multiple branches match, and opens the selected PR page", async () => {
    const client = new MockAdoClient();
    client.repositories = [
      { id: "repo-1", name: "Repo A", defaultBranch: "refs/heads/main" },
      { id: "repo-2", name: "Repo B", defaultBranch: "refs/heads/main" },
    ];
    client.refs.set("repo-1", [{ name: "refs/heads/1234-fix-login" }]);
    client.refs.set("repo-2", [{ name: "refs/heads/1234-add-tests" }]);

    const writeText = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn().mockReturnValue("2");
    const open = vi.fn();

    const result = await openAdoPullRequestCreate({
      client,
      org: "test-org",
      project: "test-project",
      workItemId: 1234,
      clipboard: { writeText },
      prompt,
      open,
    });

    expect(writeText).toHaveBeenCalledWith("1234");
    expect(prompt).toHaveBeenCalledWith(
      expect.stringContaining("1. Repo A: 1234-fix-login -> main"),
      "1",
    );
    expect(prompt).toHaveBeenCalledWith(
      expect.stringContaining("2. Repo B: 1234-add-tests -> main"),
      "1",
    );
    expect(open).toHaveBeenCalledWith(
      "https://dev.azure.com/test-org/test-project/_git/Repo%20B/pullrequestcreate?sourceRef=1234-add-tests&targetRef=main&sourceRepositoryId=repo-2&targetRepositoryId=repo-2",
      "_blank",
      "noopener,noreferrer",
    );
    expect(result).toEqual({
      status: "opened",
      candidate: {
        repositoryId: "repo-2",
        repositoryName: "Repo B",
        sourceRefName: "refs/heads/1234-add-tests",
        sourceBranchName: "1234-add-tests",
        targetRefName: "refs/heads/main",
        targetBranchName: "main",
        url: "https://dev.azure.com/test-org/test-project/_git/Repo%20B/pullrequestcreate?sourceRef=1234-add-tests&targetRef=main&sourceRepositoryId=repo-2&targetRepositoryId=repo-2",
      },
    });
  });

  it("returns no-match when no branch starts with the work item id", async () => {
    const client = new MockAdoClient();
    client.repositories = [{ id: "repo-1", name: "Repo A", defaultBranch: "refs/heads/main" }];
    client.refs.set("repo-1", [{ name: "refs/heads/9999-fix-login" }]);

    const writeText = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn();
    const open = vi.fn();

    const result = await openAdoPullRequestCreate({
      client,
      org: "test-org",
      project: "test-project",
      workItemId: 1234,
      clipboard: { writeText },
      prompt,
      open,
    });

    expect(writeText).toHaveBeenCalledWith("1234");
    expect(prompt).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "no-match" });
  });
});
