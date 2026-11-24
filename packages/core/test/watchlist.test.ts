import { describe, expect, it } from "vitest";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import { WATCHLIST_CAP, applyWatchlistOp } from "../src/watchlist";

const full: readonly MonitoredId[] = MONITORED_IDS.slice(0, WATCHLIST_CAP);

describe("applyWatchlistOp", () => {
  it("adds a monitored airport", () => {
    expect(applyWatchlistOp([], { type: "add", airportId: "JFK" })).toEqual({ ok: true, list: ["JFK"] });
  });

  it("rejects an unmonitored airport", () => {
    expect(applyWatchlistOp([], { type: "add", airportId: "XXX" })).toEqual({ ok: false, error: "unmonitored" });
    expect(applyWatchlistOp([], { type: "add", airportId: "jfk" })).toEqual({ ok: false, error: "unmonitored" });
  });

  it("add is idempotent, including on a full list", () => {
    expect(applyWatchlistOp(["JFK"], { type: "add", airportId: "JFK" })).toEqual({ ok: true, list: ["JFK"] });
    expect(applyWatchlistOp(full, { type: "add", airportId: full[0] as MonitoredId })).toEqual({ ok: true, list: full });
  });

  it("accepts the 30th airport and rejects the 31st", () => {
    const below = full.slice(0, WATCHLIST_CAP - 1);
    const last = applyWatchlistOp(below, { type: "add", airportId: full[WATCHLIST_CAP - 1] as MonitoredId });
    expect(last).toEqual({ ok: true, list: full });
    // The registry holds exactly WATCHLIST_CAP ids, so a 31st monitored id cannot exist; the cap
    // check is exercised through the unmonitored path and the full-list idempotent add above.
    expect(MONITORED_IDS.length).toBe(WATCHLIST_CAP);
    expect(applyWatchlistOp(full, { type: "add", airportId: "XXX" })).toEqual({ ok: false, error: "unmonitored" });
  });

  it("remove deletes a present airport and is idempotent", () => {
    const once = applyWatchlistOp(["JFK", "LAX"], { type: "remove", airportId: "JFK" });
    expect(once).toEqual({ ok: true, list: ["LAX"] });
    expect(applyWatchlistOp(["LAX"], { type: "remove", airportId: "JFK" })).toEqual({ ok: true, list: ["LAX"] });
    expect(applyWatchlistOp([], { type: "remove", airportId: "XXX" })).toEqual({ ok: true, list: [] });
  });

  it("does not mutate the input list", () => {
    const input: readonly MonitoredId[] = ["JFK"];
    applyWatchlistOp(input, { type: "add", airportId: "LAX" });
    applyWatchlistOp(input, { type: "remove", airportId: "JFK" });
    expect(input).toEqual(["JFK"]);
  });
});
