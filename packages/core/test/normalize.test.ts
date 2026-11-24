import { describe, expect, it } from "vitest";
import { deriveFaaEventId, normalizeResponse } from "../src/normalize";
import { AIRPORTS } from "../src/airports";
import { SnapshotSchema, type FaaResponse } from "../src/schemas";

const T1 = "2025-01-01T12:00:00.000Z";
const T2 = "2025-01-01T12:05:00.000Z";
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

const entry = (snap: ReturnType<typeof normalizeResponse>, id: string) =>
  snap.airports.find((a) => a.airportId === id);

describe("normalizeResponse", () => {
  it("drops foreign airport ids", () => {
    const faa: FaaResponse = [
      { airportId: "FMY", groundStop: { id: 1 } },
      { airportId: "TEB", groundStop: { id: 2 } },
    ];
    const s = normalizeResponse(faa, T1, ID1, null);
    expect(s.airports.every((a) => a.groundStop === null)).toBe(true);
    expect(s.airports.map((a) => a.airportId)).not.toContain("FMY");
  });

  it("merges duplicates: active beats inactive, lowest FAA_Event_ID wins", () => {
    const faa: FaaResponse = [
      { airportId: "ATL", groundStop: null },
      { airportId: "ATL", groundStop: { id: "b" } },
      { airportId: "ATL", groundStop: { id: "a" } },
    ];
    const s = normalizeResponse(faa, T1, ID1, null);
    expect(entry(s, "ATL")?.groundStop?.faaEventId).toBe("faa:a");
    expect(normalizeResponse([...faa].reverse(), T1, ID1, null)).toEqual(s);
  });

  it("fills missing airports with null, yields one sorted entries, and parses", () => {
    const s = normalizeResponse([{ airportId: "SFO", groundStop: { id: 9, impactingCondition: "wind" } }], T1, ID1, null);
    expect(s.airports).toHaveLength(AIRPORTS.length);
    const ids = s.airports.map((a) => a.airportId);
    expect(ids).toEqual([...ids].sort());
    expect(entry(s, "JFK")?.groundStop).toBeNull();
    expect(entry(s, "SFO")?.groundStop?.reason).toBe("wind");
    expect(SnapshotSchema.safeParse(s).success).toBe(true);
  });

  it("does not mutate inputs", () => {
    const faa: FaaResponse = [{ airportId: "ATL", groundStop: { id: 1 } }];
    const copy = structuredClone(faa);
    normalizeResponse(faa, T1, ID1, null);
    expect(faa).toEqual(copy);
  });

  it("carries a seen: id forward while the stop stays active", () => {
    const faa: FaaResponse = [{ airportId: "ORD", groundStop: {} }];
    const first = normalizeResponse(faa, T1, ID1, null);
    expect(entry(first, "ORD")?.groundStop).toMatchObject({
      faaEventId: `seen:ORD:${T1}`,
      idSource: "first_seen",
    });
    const second = normalizeResponse(faa, T2, ID2, first);
    expect(entry(second, "ORD")?.groundStop?.faaEventId).toBe(`seen:ORD:${T1}`);
    expect(SnapshotSchema.safeParse(second).success).toBe(true);
  });
});

describe("deriveFaaEventId", () => {
  it("uses faa: when the ground stop has an id", () => {
    expect(deriveFaaEventId("ATL", { id: 42, startTime: T1 }, T2, null)).toEqual({
      faaEventId: "faa:42",
      idSource: "faa_id",
    });
  });

  it("uses start: with only a startTime, normalized to ISO UTC ms", () => {
    expect(deriveFaaEventId("ATL", { id: " ", startTime: "2025-01-01T12:00:00Z" }, T2, null)).toEqual({
      faaEventId: `start:ATL:${T1}`,
      idSource: "start_time",
    });
  });

  it("uses seen: with neither, treating an unparseable startTime as absent", () => {
    expect(deriveFaaEventId("ATL", { startTime: "garbage" }, T2, null)).toEqual({
      faaEventId: `seen:ATL:${T2}`,
      idSource: "first_seen",
    });
  });
});
