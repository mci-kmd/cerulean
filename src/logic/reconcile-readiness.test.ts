import { describe, expect, it } from "vitest";
import { isReconcileReady } from "./reconcile-readiness";

describe("isReconcileReady", () => {
  it("returns false until source query is loaded", () => {
    expect(isReconcileReady(false, false, undefined)).toBe(false);
    expect(isReconcileReady(false, true, "Resolved")).toBe(false);
  });

  it("returns true when source is loaded and approval state is not configured", () => {
    expect(isReconcileReady(true, false, undefined)).toBe(true);
    expect(isReconcileReady(true, false, "")).toBe(true);
  });

  it("requires completed query when approval state is configured", () => {
    expect(isReconcileReady(true, false, "Resolved")).toBe(false);
    expect(isReconcileReady(true, true, "Resolved")).toBe(true);
  });
});
