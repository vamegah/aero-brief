import { describe, expect, it } from "vitest";
import { MONITORED_IDS } from "../src/airports";
import { completeSnapshotAirports } from "../src/snapshot-compat";
import { SnapshotSchema } from "../src/schemas";

const ID = "11111111-1111-4111-8111-111111111111";
const AT = "2025-01-01T12:00:00.000Z";

const sorted = [...MONITORED_IDS].sort();
// A legacy-style snapshot: the first 20 airports only, all without a ground stop.
const legacy = sorted.slice(0, 20).map((airportId) => ({ airportId, groundStop: null }));

const stop = {
  faaEventId: "e1",
  idSource: "faa",
  reason: "VOLUME",
  center: "ZNY",
  endTime: null,
  expectedEnd: null,
  advisoryUrl: null,
};

describe("completeSnapshotAirports", () => {
  it("fills a legacy snapshot up to the full registry with null stops, sorted", () => {
    const out = completeSnapshotAirports(legacy) as { airportId: string; groundStop: unknown }[];
    expect(out.map((a) => a.airportId)).toEqual(sorted);
    for (const a of out.slice(0, 20)) expect(a).toEqual({ airportId: a.airportId, groundStop: null });
    expect(out.slice(20).every((a) => a.groundStop === null)).toBe(true);
  });

  it("makes a legacy snapshot pass SnapshotSchema", () => {
    expect(SnapshotSchema.safeParse({ id: ID, capturedAt: AT, airports: legacy }).success).toBe(false);
    const completed = completeSnapshotAirports(legacy);
    expect(SnapshotSchema.safeParse({ id: ID, capturedAt: AT, airports: completed }).success).toBe(true);
  });

  it("keeps stored entries, including active ground stops, unchanged", () => {
    const withStop = [{ airportId: sorted[3]!, groundStop: stop }, ...legacy.filter((a) => a.airportId !== sorted[3])];
    const out = completeSnapshotAirports(withStop) as { airportId: string; groundStop: unknown }[];
    expect(out.find((a) => a.airportId === sorted[3])?.groundStop).toEqual(stop);
  });

  it("returns non-array input unchanged", () => {
    expect(completeSnapshotAirports(null)).toBeNull();
    expect(completeSnapshotAirports("x")).toBe("x");
    const obj = {};
    expect(completeSnapshotAirports(obj)).toBe(obj);
  });

  it("keeps unknown ids so the schema still rejects them", () => {
    const out = completeSnapshotAirports([...legacy, { airportId: "CLE", groundStop: null }]);
    expect((out as { airportId: string }[]).some((a) => a.airportId === "CLE")).toBe(true);
    expect(SnapshotSchema.safeParse({ id: ID, capturedAt: AT, airports: out }).success).toBe(false);
  });

  it("does not mutate its input and is idempotent", () => {
    const copy = structuredClone(legacy);
    const once = completeSnapshotAirports(legacy);
    expect(legacy).toEqual(copy);
    expect(completeSnapshotAirports(once)).toEqual(once);
  });

  it("does not throw on malformed entries", () => {
    const out = completeSnapshotAirports([null, 5, { foo: 1 }]) as unknown[];
    expect(out).toHaveLength(MONITORED_IDS.length + 3);
  });
});
