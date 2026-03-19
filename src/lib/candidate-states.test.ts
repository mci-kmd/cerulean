import { describe, expect, it } from "vitest";
import {
  buildCandidateStateRules,
  getCandidateStateForType,
  hasCandidateStateConfiguration,
  isCandidateWorkItem,
  parseCandidateStatesByType,
  parseWorkItemTypes,
} from "./candidate-states";

describe("candidate state helpers", () => {
  it("parses work item types", () => {
    expect(parseWorkItemTypes("Bug, User Story, Task")).toEqual([
      "Bug",
      "User Story",
      "Task",
    ]);
  });

  it("parses candidate states by type from multiple separators", () => {
    expect(
      parseCandidateStatesByType("Bug=New; User Story: Approved\nTask=Ready"),
    ).toEqual(
      new Map([
        ["Bug", "New"],
        ["User Story", "Approved"],
        ["Task", "Ready"],
      ]),
    );
  });

  it("prefers per-type candidate state over fallback", () => {
    expect(
      getCandidateStateForType("Bug", "Approved", "Bug=New; User Story=Approved"),
    ).toBe("New");
    expect(
      getCandidateStateForType("Task", "Approved", "Bug=New; User Story=Approved"),
    ).toBe("Approved");
  });

  it("detects when any candidate config exists", () => {
    expect(hasCandidateStateConfiguration("", "Bug=New")).toBe(true);
    expect(hasCandidateStateConfiguration("Approved", "")).toBe(true);
    expect(hasCandidateStateConfiguration("", "")).toBe(false);
  });

  it("matches work items using per-type candidate state", () => {
    expect(
      isCandidateWorkItem(
        { type: "Bug", state: "New" },
        "Approved",
        "Bug=New; User Story=Approved",
      ),
    ).toBe(true);
    expect(
      isCandidateWorkItem(
        { type: "User Story", state: "New" },
        "Approved",
        "Bug=New; User Story=Approved",
      ),
    ).toBe(false);
  });

  it("builds grouped rules for overrides plus fallback", () => {
    expect(
      buildCandidateStateRules(
        "Approved",
        "Bug=New; User Story=Approved; Task=New",
        "Bug, User Story, Task",
      ),
    ).toEqual([
      { state: "New", includeTypes: ["Bug", "Task"] },
      { state: "Approved", includeTypes: ["User Story"] },
    ]);
  });

  it("excludes override types from fallback rule when all types are allowed", () => {
    expect(
      buildCandidateStateRules("Approved", "Bug=New; Task=Ready"),
    ).toEqual([
      { state: "New", includeTypes: ["Bug"] },
      { state: "Ready", includeTypes: ["Task"] },
      { state: "Approved", excludeTypes: ["Bug", "Task"] },
    ]);
  });
});
