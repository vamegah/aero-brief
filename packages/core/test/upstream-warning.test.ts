import { describe, expect, it } from "vitest";
import { shouldWarnUpstreamFailure } from "../src/upstream-warning";

const now = new Date("2026-11-21T02:30:00.000Z");

describe("shouldWarnUpstreamFailure", () => {
  it("warns when there is no previous poll", () => {
    expect(shouldWarnUpstreamFailure(null, now)).toBe(true);
  });

  it("warns when the previous poll succeeded", () => {
    expect(shouldWarnUpstreamFailure({ outcome: "success", startedAt: new Date("2026-11-21T02:25:00.000Z") }, now)).toBe(true);
  });

  it("does not warn when the previous poll failed in the same UTC hour", () => {
    expect(shouldWarnUpstreamFailure({ outcome: "failed", startedAt: new Date("2026-11-21T02:25:00.000Z") }, now)).toBe(false);
  });

  it("warns when the previous poll failed in an earlier UTC hour", () => {
    expect(shouldWarnUpstreamFailure({ outcome: "failed", startedAt: new Date("2026-11-21T01:55:00.000Z") }, now)).toBe(true);
  });

  it("warns exactly on the hour boundary and not one millisecond before it", () => {
    const previous = { outcome: "failed" as const, startedAt: new Date("2026-11-21T01:59:59.999Z") };
    expect(shouldWarnUpstreamFailure(previous, new Date("2026-11-21T02:00:00.000Z"))).toBe(true);
    expect(shouldWarnUpstreamFailure(previous, new Date("2026-11-21T01:59:59.999Z"))).toBe(false);
  });

  it("does not warn when the previous failure started exactly at the top of the same hour", () => {
    expect(shouldWarnUpstreamFailure({ outcome: "failed", startedAt: new Date("2026-11-21T02:00:00.000Z") }, now)).toBe(false);
  });
});
