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

  it("accepts the 10th airport and rejects the 11th", () => {
    const nine = full.slice(0, 9);
    const tenth = applyWatchlistOp(nine, { type: "add", airportId: full[9] as MonitoredId });
    expect(tenth).toEqual({ ok: true, list: full });
    const eleventh = MONITORED_IDS[10] as MonitoredId;
    expect(applyWatchlistOp(full, { type: "add", airportId: eleventh })).toEqual({ ok: false, error: "cap_exceeded" });
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
