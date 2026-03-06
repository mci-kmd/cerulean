import { describe, it, expect } from "vitest";
import { buildWiqlQuery, buildCompletedWiqlQuery, buildCandidateWiqlQuery } from "./wiql";

describe("buildWiqlQuery", () => {
  it("builds query with source state", () => {
    const q = buildWiqlQuery("Active");
    expect(q).toContain("[System.State] = 'Active'");
    expect(q).toContain("[System.AssignedTo] = @Me");
    expect(q).toContain("SELECT [System.Id]");
  });

  it("escapes single quotes", () => {
    const q = buildWiqlQuery("It's Active");
    expect(q).toContain("'It''s Active'");
  });

  it("handles empty state", () => {
    const q = buildWiqlQuery("");
    expect(q).toContain("[System.State] = ''");
  });

  it("adds area path UNDER clause when provided", () => {
    const q = buildWiqlQuery("Active", "Project\\Team");
    expect(q).toContain("[System.AreaPath] UNDER 'Project\\Team'");
    expect(q).toContain("[System.AssignedTo] = @Me");
  });

  it("omits area path clause when empty", () => {
    const q = buildWiqlQuery("Active", "");
    expect(q).not.toContain("AreaPath");
  });

  it("escapes single quotes in area path", () => {
    const q = buildWiqlQuery("Active", "Project\\It's a Team");
    expect(q).toContain("'Project\\It''s a Team'");
  });

  it("adds work item type IN clause when provided", () => {
    const q = buildWiqlQuery("Active", "", "Bug, User Story");
    expect(q).toContain("[System.WorkItemType] IN ('Bug', 'User Story')");
  });

  it("omits type clause when empty", () => {
    const q = buildWiqlQuery("Active", "", "");
    expect(q).not.toContain("WorkItemType");
  });

  it("handles single type", () => {
    const q = buildWiqlQuery("Active", "", "Bug");
    expect(q).toContain("[System.WorkItemType] IN ('Bug')");
  });

  it("combines area path and type filters", () => {
    const q = buildWiqlQuery("Active", "Project\\Team", "Bug, Task");
    expect(q).toContain("[System.AreaPath] UNDER 'Project\\Team'");
    expect(q).toContain("[System.WorkItemType] IN ('Bug', 'Task')");
  });

  it("escapes single quotes in type names", () => {
    const q = buildWiqlQuery("Active", "", "It's a Type");
    expect(q).toContain("'It''s a Type'");
  });
});

describe("buildCompletedWiqlQuery", () => {
  it("filters by approval state and assigned to me", () => {
    const q = buildCompletedWiqlQuery("Resolved");
    expect(q).toContain("[System.State] = 'Resolved'");
    expect(q).toContain("[System.AssignedTo] = @Me");
    expect(q).not.toContain("ORDER BY");
  });

  it("adds area path filter", () => {
    const q = buildCompletedWiqlQuery("Resolved", "Project\\Team");
    expect(q).toContain("[System.AreaPath] UNDER 'Project\\Team'");
  });

  it("adds work item type filter", () => {
    const q = buildCompletedWiqlQuery("Resolved", "", "Bug, Task");
    expect(q).toContain("[System.WorkItemType] IN ('Bug', 'Task')");
  });
});

describe("buildCandidateWiqlQuery", () => {
  it("filters by state and unassigned", () => {
    const q = buildCandidateWiqlQuery("New");
    expect(q).toContain("[System.State] = 'New'");
    expect(q).toContain("[System.AssignedTo] = ''");
    expect(q).not.toContain("@Me");
    expect(q).toContain("ORDER BY [System.CreatedDate] DESC");
  });

  it("escapes single quotes", () => {
    const q = buildCandidateWiqlQuery("It's New");
    expect(q).toContain("'It''s New'");
  });

  it("adds area path UNDER clause when provided", () => {
    const q = buildCandidateWiqlQuery("New", "Project\\Team");
    expect(q).toContain("[System.AreaPath] UNDER 'Project\\Team'");
    expect(q).toContain("[System.AssignedTo] = ''");
    expect(q).toContain("ORDER BY [System.CreatedDate] DESC");
  });

  it("omits area path clause when empty", () => {
    const q = buildCandidateWiqlQuery("New", "");
    expect(q).not.toContain("AreaPath");
  });

  it("adds work item type filter", () => {
    const q = buildCandidateWiqlQuery("New", "", "Bug, Task");
    expect(q).toContain("[System.WorkItemType] IN ('Bug', 'Task')");
    expect(q).toContain("ORDER BY [System.CreatedDate] DESC");
  });

  it("omits type clause when empty", () => {
    const q = buildCandidateWiqlQuery("New", "", "");
    expect(q).not.toContain("WorkItemType");
  });
});
