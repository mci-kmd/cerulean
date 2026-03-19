import { describe, expect, it } from "vitest";
import {
  buildCandidateBoardConfig,
  getCandidateStateFromBoardConfig,
  pickCandidateBoard,
} from "./ado-board";
import type { AdoBoard } from "@/types/ado";

function createBoard(overrides: Partial<AdoBoard> = {}): AdoBoard {
  return {
    id: overrides.id ?? "board-1",
    name: overrides.name ?? "Stories",
    url: overrides.url ?? "https://example.test/board/1",
    columns: overrides.columns ?? [
      {
        id: "col-1",
        name: "New",
        columnType: "incoming",
        stateMappings: { Bug: "New", "User Story": "Approved" },
      },
    ],
    fields: overrides.fields ?? {
      columnField: { referenceName: "WEF_FAKE_Kanban.Column" },
      doneField: { referenceName: "WEF_FAKE_Kanban.Column.Done" },
    },
  };
}

describe("ado board helpers", () => {
  it("prefers common requirement boards", () => {
    const picked = pickCandidateBoard([
      createBoard({ id: "feature", name: "Features" }),
      createBoard({ id: "story", name: "Stories" }),
    ]);

    expect(picked?.id).toBe("story");
  });

  it("prefers board matching configured work item types", () => {
    const picked = pickCandidateBoard([
      createBoard({
        id: "feature",
        name: "Features",
        columns: [{ id: "col-1", name: "New", stateMappings: { Feature: "New" } }],
      }),
      createBoard({
        id: "story",
        name: "Custom Board",
        columns: [{ id: "col-1", name: "New", stateMappings: { Bug: "New" } }],
      }),
    ], "Bug");

    expect(picked?.id).toBe("story");
  });

  it("prefers board containing configured board columns", () => {
    const picked = pickCandidateBoard(
      [
        createBoard({
          id: "story",
          name: "Stories",
          columns: [{ id: "col-1", name: "New", stateMappings: { Bug: "New" } }],
        }),
        createBoard({
          id: "feature",
          name: "Features",
          columns: [{ id: "col-2", name: "Approved", stateMappings: { Feature: "Active" } }],
        }),
      ],
      undefined,
      ["Approved"],
    );

    expect(picked?.id).toBe("feature");
  });

  it("builds candidate board config from incoming column", () => {
    const config = buildCandidateBoardConfig(createBoard(), "My Team");

    expect(config.team).toBe("My Team");
    expect(config.intakeColumnName).toBe("New");
    expect(config.columnFieldReferenceName).toBe("WEF_FAKE_Kanban.Column");
    expect(config.boardColumnsByName?.new?.stateMappings).toEqual({
      Bug: "New",
      "User Story": "Approved",
    });
  });

  it("builds candidate board config from a configured intake column", () => {
    const config = buildCandidateBoardConfig(
      createBoard({
        columns: [
          {
            id: "col-1",
            name: "New",
            columnType: "incoming",
            stateMappings: { Bug: "New" },
          },
          {
            id: "col-2",
            name: "Ideas",
            stateMappings: { Bug: "Proposed" },
          },
        ],
      }),
      "My Team",
      "Ideas",
    );

    expect(config.intakeColumnName).toBe("Ideas");
    expect(config.intakeStateMappings).toEqual({ Bug: "Proposed" });
  });

  it("throws when the configured intake column is missing", () => {
    expect(() =>
      buildCandidateBoardConfig(createBoard(), "My Team", "Ideas"),
    ).toThrow("Board Stories is missing intake column Ideas");
  });

  it("returns mapped intake state for a work item type", () => {
    const config = buildCandidateBoardConfig(createBoard(), "My Team");
    expect(getCandidateStateFromBoardConfig(config, "Bug")).toBe("New");
    expect(getCandidateStateFromBoardConfig(config, "Task")).toBeUndefined();
  });
});
