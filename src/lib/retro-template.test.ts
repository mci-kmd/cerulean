import { describe, expect, it } from "vitest";
import {
  buildRetroFilePath,
  buildRetroFilename,
  buildRetroTemplatePath,
  findLatestRetroFile,
  formatRetroDate,
  normalizeRetroFolder,
  prepareRetroDraft,
} from "./retro-template";

describe("retro-template", () => {
  it("formats retro dates as yyyy-MM-dd", () => {
    expect(formatRetroDate(new Date(2026, 2, 23))).toBe("2026-03-23");
  });

  it("builds filenames from date tokens", () => {
    expect(buildRetroFilename("retro-{date}.md", new Date(2026, 2, 23))).toBe(
      "retro-2026-03-23.md",
    );
    expect(buildRetroFilename("{yyyy}.{MM}.{dd}.md", new Date(2026, 2, 23))).toBe(
      "2026.03.23.md",
    );
  });

  it("normalizes folder and file paths", () => {
    expect(normalizeRetroFolder("\\retros\\notes\\")).toBe("/retros/notes");
    expect(buildRetroFilePath("\\retros\\notes\\", "2026-03-23.md")).toBe(
      "/retros/notes/2026-03-23.md",
    );
    expect(buildRetroTemplatePath("\\retros\\notes\\")).toBe("/retros/notes/Template.md");
  });

  it("finds the newest dated retro file from matching filenames", () => {
    const file = findLatestRetroFile(
      [
        { path: "/retros/2026-03-02.md" },
        { path: "/retros/2026-03-16.md" },
        { path: "/retros/readme.md" },
      ],
      "{date}.md",
    );

    expect(file?.path).toBe("/retros/2026-03-16.md");
  });

  it("falls back to latest markdown path when filenames do not match the pattern", () => {
    const file = findLatestRetroFile(
      [
        { path: "/retros/a.md" },
        { path: "/retros/z.md" },
      ],
      "retro-{date}.md",
    );

    expect(file?.path).toBe("/retros/z.md");
  });

  it("prepares a new retro draft from the template and seeds follow-up from the previous retro", () => {
    const result = prepareRetroDraft(
      [
        "# Retrospective DATE",
        "",
        "## Follow up on previous retrospectives",
        "",
        "## How did it go (1-5)?",
        "",
        "- Julie:    ",
        "- Morten:   ",
        "",
        "## What went well?",
        "",
        "Julie",
        "- ",
        "",
        "## What didn't go so well?",
        "",
        "Julie",
        "- ",
        "",
        "## Solutions",
        "",
      ].join("\n"),
      [
        "# Retrospective 2026-03-05",
        "",
        "## Follow up on previous retrospectives",
        "",
        "### Hiring process",
        "",
        "- Going forward, HR should be more involved.",
        "- We should move faster when processing applicants.",
        "",
        "> Morten's 1:1 still pending.",
        "",
        "## Solutions",
        "",
        "### Agent queue",
        "",
        "- **MCI** creates a POC user story for setting up our own agent.",
        "- Try removing releases from the steps that are a part of release windows.",
        "",
        "## What went well?",
        "",
        "Julie",
        "- The start of changing certificates seems to have gone well.",
      ].join("\n"),
      new Date(2026, 2, 23),
    );

    expect(result.reviewItems).toEqual([
      "- [ ] Going forward, HR should be more involved.",
      "- [ ] We should move faster when processing applicants.",
      "- [ ] **MCI** creates a POC user story for setting up our own agent.",
      "- [ ] Try removing releases from the steps that are a part of release windows.",
    ]);
    expect(result.content).toContain("# Retrospective 2026-03-23");
    expect(result.content).toContain("## Follow up on previous retrospectives");
    expect(result.content).toContain("### Hiring process");
    expect(result.content).toContain("> Morten's 1:1 still pending.");
    expect(result.content).toContain("### Agent queue");
    expect(result.content).toContain("- Julie:    ");
    expect(result.content).not.toContain("The start of changing certificates seems to have gone well.");
  });

  it("keeps the template blank when no previous retro is available", () => {
    const result = prepareRetroDraft(
      [
        "# Retrospective DATE",
        "",
        "## Follow up on previous retrospectives",
        "",
        "## Solutions",
      ].join("\n"),
      "",
      new Date(2026, 2, 23),
    );

    expect(result.reviewItems).toEqual([]);
    expect(result.content).toBe(
      ["# Retrospective 2026-03-23", "", "## Follow up on previous retrospectives", "", "## Solutions"]
        .join("\n"),
    );
  });

  it("adds a follow-up section when the template does not already have one", () => {
    const result = prepareRetroDraft(
      [
        "# Retrospective DATE",
        "",
        "## Solutions",
      ].join("\n"),
      [
        "# Retrospective 2026-03-05",
        "",
        "## Decisions",
        "- Follow up on flaky test cleanup",
      ].join("\n"),
      new Date(2026, 2, 23),
    );

    expect(result.content).toContain(
      "## Follow up on previous retrospectives\n\n### Decisions\n- Follow up on flaky test cleanup",
    );
  });
});
