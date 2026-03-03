import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "./format-time";

describe("formatRelativeTime", () => {
  afterEach(() => vi.useRealTimers());

  it("returns 'just now' for timestamps less than 10s ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    expect(formatRelativeTime(5_000)).toBe("just now");
  });

  it("returns seconds for timestamps 10-59s ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(45_000);
    expect(formatRelativeTime(0)).toBe("45s ago");
  });

  it("returns minutes for timestamps 1-59m ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(120_000);
    expect(formatRelativeTime(0)).toBe("2m ago");
  });

  it("returns hours for timestamps 1-23h ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(7_200_000);
    expect(formatRelativeTime(0)).toBe("2h ago");
  });

  it("returns days for timestamps 24h+ ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(172_800_000);
    expect(formatRelativeTime(0)).toBe("2d ago");
  });

  it("returns 'just now' for future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    expect(formatRelativeTime(5000)).toBe("just now");
  });
});
