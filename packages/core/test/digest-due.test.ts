import { describe, expect, it } from "vitest";
import { selectDueDigests, type DigestPrefRow } from "../src/digest/due";

const pref = (over: Partial<DigestPrefRow> = {}): DigestPrefRow => ({
  userId: "u1",
  enabled: true,
  hour: 7,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});
const run = (
  now: string,
  prefs: DigestPrefRow[],
  claimed: string[] = [],
  counts: [string, number][] = [["u1", 2]],
) =>
  selectDueDigests({
    now: new Date(now),
    prefs,
    claimedKeys: new Set(claimed),
    watchlistCounts: new Map(counts),
  });

describe("selectDueDigests", () => {
  it("selects at offset 0 with minutes truncated", () => {
    const r = run("2026-03-10T07:00:30Z", [pref()]);
    expect(r).toEqual([
      { userId: "u1", digestDate: "2026-03-10", scheduledAt: new Date("2026-03-10T07:00:00Z") },
    ]);
  });

  it("catches up at offsets 1 to 3 but not 4", () => {
    expect(run("2026-03-10T10:05:00Z", [pref()])).toHaveLength(1);
    expect(run("2026-03-10T11:00:00Z", [pref()])).toHaveLength(0);
    expect(run("2026-03-10T06:00:00Z", [pref()])).toHaveLength(0);
  });

  it("uses the previous date for a catch-up after midnight", () => {
    const r = run("2026-03-11T01:00:00Z", [pref({ hour: 23 })]);
    expect(r[0]?.digestDate).toBe("2026-03-10");
    expect(r[0]?.scheduledAt).toEqual(new Date("2026-03-10T23:00:00Z"));
  });

  it("drops disabled preferences", () => {
    expect(run("2026-03-10T07:00:00Z", [pref({ enabled: false })])).toHaveLength(0);
  });

  it("drops when updated after the scheduled instant", () => {
    const late = pref({ updatedAt: new Date("2026-03-10T07:00:01Z") });
    expect(run("2026-03-10T08:00:00Z", [late])).toHaveLength(0);
    const exact = pref({ updatedAt: new Date("2026-03-10T07:00:00Z") });
    expect(run("2026-03-10T08:00:00Z", [exact])).toHaveLength(1);
  });

  it("drops an empty or missing watchlist", () => {
    expect(run("2026-03-10T07:00:00Z", [pref()], [], [["u1", 0]])).toHaveLength(0);
    expect(run("2026-03-10T07:00:00Z", [pref()], [], [])).toHaveLength(0);
  });

  it("drops a claimed key for the scheduled digestDate only", () => {
    expect(run("2026-03-11T01:00:00Z", [pref({ hour: 23 })], ["u1|2026-03-10"])).toHaveLength(0);
    expect(run("2026-03-11T01:00:00Z", [pref({ hour: 23 })], ["u1|2026-03-11"])).toHaveLength(1);
  });

  it("returns each user at most once", () => {
    const r = run("2026-03-10T07:00:00Z", [pref(), pref()]);
    expect(r).toHaveLength(1);
  });
});
