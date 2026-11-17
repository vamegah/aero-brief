import { describe, expect, test } from "vitest";
import { RETENTION_MS, STALE_THRESHOLD_MS, isStale, withinRetention } from "../src/time";

const NOW = new Date("2024-06-01T12:00:00.000Z");
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

describe("constants", () => {
  test("thresholds", () => {
    expect(STALE_THRESHOLD_MS).toBe(600_000);
    expect(RETENTION_MS).toBe(86_400_000);
  });
});

describe("isStale", () => {
  test("600 000 ms is not stale", () => {
    expect(isStale(ago(600_000), NOW)).toBe(false);
  });
  test("600 001 ms is stale", () => {
    expect(isStale(ago(600_001), NOW)).toBe(true);
  });
  test("fresh is not stale", () => {
    expect(isStale(ago(0), NOW)).toBe(false);
  });
  test("future capturedAt is not stale", () => {
    expect(isStale(ago(-5_000), NOW)).toBe(false);
  });
  test("unparseable capturedAt is stale", () => {
    expect(isStale("not-a-date", NOW)).toBe(true);
  });
});

describe("withinRetention", () => {
  test("86 400 000 ms is within retention", () => {
    expect(withinRetention(ago(86_400_000), NOW)).toBe(true);
  });
  test("86 400 001 ms is not within retention", () => {
    expect(withinRetention(ago(86_400_001), NOW)).toBe(false);
  });
  test("future timestamp is within retention", () => {
    expect(withinRetention(ago(-5_000), NOW)).toBe(true);
  });
  test("unparseable timestamp is not within retention", () => {
    expect(withinRetention("garbage", NOW)).toBe(false);
  });
});
