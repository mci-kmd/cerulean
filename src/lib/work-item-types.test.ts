import { describe, it, expect } from "vitest";
import { Bug, BookOpen, CircleDot } from "lucide-react";
import { getTypeStyle, getTypeIcon } from "./work-item-types";

describe("getTypeStyle", () => {
  it("returns bug style for Bug type", () => {
    const style = getTypeStyle("Bug");
    expect(style.border).toContain("red");
    expect(style.text).toContain("red");
  });

  it("returns primary style for User Story type", () => {
    const style = getTypeStyle("User Story");
    expect(style.border).toContain("primary");
    expect(style.text).toContain("primary");
  });

  it("returns fallback style for unknown type", () => {
    const style = getTypeStyle("Epic");
    expect(style.border).toContain("slate");
  });

  it("returns fallback style for empty string", () => {
    const style = getTypeStyle("");
    expect(style.border).toContain("slate");
  });
});

describe("getTypeIcon", () => {
  it("returns Bug icon for Bug type", () => {
    expect(getTypeIcon("Bug")).toBe(Bug);
  });

  it("returns BookOpen icon for User Story type", () => {
    expect(getTypeIcon("User Story")).toBe(BookOpen);
  });

  it("returns CircleDot icon for unknown type", () => {
    expect(getTypeIcon("Task")).toBe(CircleDot);
  });
});
