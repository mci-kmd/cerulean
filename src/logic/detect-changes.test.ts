import { describe, it, expect } from "vitest";
import { detectChanges } from "./detect-changes";

describe("detectChanges", () => {
  it("detects added items", () => {
    const cached = new Map<number, { rev: number }>();
    const fresh = [{ id: 1, rev: 1 }, { id: 2, rev: 1 }];

    const result = detectChanges(cached, fresh);
    expect(result.added).toEqual([1, 2]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("detects removed items", () => {
    const cached = new Map([
      [1, { rev: 1 }],
      [2, { rev: 1 }],
    ]);
    const fresh = [{ id: 1, rev: 1 }];

    const result = detectChanges(cached, fresh);
    expect(result.removed).toEqual([2]);
    expect(result.unchanged).toEqual([1]);
  });

  it("detects changed items by rev", () => {
    const cached = new Map([
      [1, { rev: 1 }],
      [2, { rev: 3 }],
    ]);
    const fresh = [
      { id: 1, rev: 2 }, // changed
      { id: 2, rev: 3 }, // unchanged
    ];

    const result = detectChanges(cached, fresh);
    expect(result.changed).toEqual([1]);
    expect(result.unchanged).toEqual([2]);
  });

  it("handles empty inputs", () => {
    const result = detectChanges(new Map(), []);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it("handles mixed operations", () => {
    const cached = new Map([
      [1, { rev: 1 }],
      [2, { rev: 2 }],
      [3, { rev: 1 }],
    ]);
    const fresh = [
      { id: 1, rev: 1 }, // unchanged
      { id: 2, rev: 5 }, // changed
      { id: 4, rev: 1 }, // added
    ]; // 3 removed

    const result = detectChanges(cached, fresh);
    expect(result.unchanged).toEqual([1]);
    expect(result.changed).toEqual([2]);
    expect(result.added).toEqual([4]);
    expect(result.removed).toEqual([3]);
  });
});
