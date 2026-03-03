import { describe, it, expect } from "vitest";
import { buildWiqlQuery } from "./wiql";

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
});
