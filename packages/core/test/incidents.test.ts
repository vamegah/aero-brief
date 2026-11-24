import { describe, expect, test } from "vitest";
import { mergeIncidents, sortIncidents, type Incident } from "../src/incidents";

const gs = (
  type: "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED",
  key: string,
  at: string,
  airportId: "JFK" | "ATL" = "JFK",
) => ({
  type,
  airportId,
  occurredAt: at,
  faaEventId: key,
  reason: null,
  incidentKey: key,
});

describe("mergeIncidents", () => {
  test("pairs a started and ended event with the same key", () => {
    const out = mergeIncidents([
      gs("GROUND_STOP_STARTED", "k1", "2026-11-13T10:00:00.000Z"),
      gs("GROUND_STOP_ENDED", "k1", "2026-11-13T11:30:00.000Z"),
    ]);
    expect(out).toEqual([
      {
        incidentKey: "k1",
        type: "GROUND_STOP_STARTED",
        airportId: "JFK",
        startedAt: "2026-11-13T10:00:00.000Z",
        endedAt: "2026-11-13T11:30:00.000Z",
        durationMs: 90 * 60_000,
      },
    ]);
  });

  test("an unmatched GROUND_STOP_ENDED becomes its own ended Incident with startedAt = endedAt", () => {
    const out = mergeIncidents([gs("GROUND_STOP_ENDED", "orphan", "2026-11-13T12:00:00.000Z", "ATL")]);
    expect(out).toEqual([
      {
        incidentKey: "orphan",
        type: "GROUND_STOP_STARTED",
        airportId: "ATL",
        startedAt: "2026-11-13T12:00:00.000Z",
        endedAt: "2026-11-13T12:00:00.000Z",
        durationMs: 0,
      },
    ]);
  });

  test("a started event with no end is active; nationwide events stay active with no airport", () => {
    const out = mergeIncidents([
      gs("GROUND_STOP_STARTED", "k2", "2026-11-13T10:00:00.000Z"),
      {
        type: "NATIONWIDE_EVENT",
        occurredAt: "2026-11-13T10:05:00.000Z",
        count: 3,
        affectedArtccs: ["ZBW", "ZDC", "ZNY"],
        incidentKey: "NATIONWIDE:snap-1",
      },
    ]);
    expect(out.map((i) => [i.incidentKey, i.type, i.airportId, i.endedAt, i.durationMs])).toEqual([
      ["k2", "GROUND_STOP_STARTED", "JFK", null, null],
      ["NATIONWIDE:snap-1", "NATIONWIDE_EVENT", null, null, null],
    ]);
  });

  test("empty input gives no incidents", () => {
    expect(mergeIncidents([])).toEqual([]);
  });
});

describe("sortIncidents", () => {
  const inc = (key: string, endedAt: string | null): Incident => ({
    incidentKey: key,
    type: "GROUND_STOP_STARTED",
    airportId: "JFK",
    startedAt: "2026-11-13T09:00:00.000Z",
    endedAt,
    durationMs: endedAt === null ? null : 1,
  });

  test("active first, then ended most recent first", () => {
    const sorted = sortIncidents([
      inc("old", "2026-11-13T10:00:00.000Z"),
      inc("active", null),
      inc("new", "2026-11-13T12:00:00.000Z"),
    ]);
    expect(sorted.map((i) => i.incidentKey)).toEqual(["active", "new", "old"]);
  });

  test("does not mutate its input", () => {
    const input = [inc("a", "2026-11-13T10:00:00.000Z"), inc("b", null)];
    sortIncidents(input);
    expect(input.map((i) => i.incidentKey)).toEqual(["a", "b"]);
  });
});
