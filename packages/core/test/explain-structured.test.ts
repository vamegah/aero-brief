import { describe, expect, test } from "vitest";
import { mergeIncidents } from "../src/incidents";
import type { Incident } from "../src/incidents";
import {
  NOT_AVAILABLE,
  NOT_YET_ANNOUNCED,
  REASON_NOT_PUBLISHED,
  STRUCTURED_SOURCE,
  UnsupportedEventTypeError,
  explainStructured,
} from "../src/explain";

const START = "2024-06-01T12:00:00.000Z";
const NOW = new Date("2024-06-01T13:00:00.000Z");

const active: Incident = {
  incidentKey: "k1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  startedAt: START,
  endedAt: null,
  durationMs: null,
};

describe("explainStructured", () => {
  test("active ground stop with reason and expected end", () => {
    const out = explainStructured(active, "wind", "2024-06-01T14:30:00.000Z", NOW);
    expect(out.whatsHappening).toContain("John F. Kennedy International (JFK)");
    expect(out.why).toBe("The FAA says the cause is strong winds");
    expect(out.nextUpdate).toBe("Expected to end around 2024-06-01 14:30 UTC");
    expect(out.source).toBe(STRUCTURED_SOURCE);
  });

  test("absent inputs use the fallback strings", () => {
    const out = explainStructured(active, null, null, NOW);
    expect(out.why).toBe(REASON_NOT_PUBLISHED);
    expect(out.nextUpdate).toBe(NOT_YET_ANNOUNCED);
  });

  test("unreadable start time gives Not available for likely impact", () => {
    const out = explainStructured({ ...active, startedAt: "nope" }, null, null, NOW);
    expect(out.likelyImpact).toBe(NOT_AVAILABLE);
  });

  test("labeled estimate shows a range and its basis", () => {
    // 60 minutes elapsed: 30 to 90 minute range.
    const out = explainStructured(active, null, null, NOW);
    expect(out.likelyImpact).toBe(
      "AeroBrief estimate: delays may last about 30 min to 1 h 30 min after the ground stop ends, based on how long the ground stop has lasted so far (about 60 minutes).",
    );
  });

  test("estimate bounds use the shared duration formatter, never raw minutes", () => {
    const long: Incident = {
      ...active,
      endedAt: "2024-06-02T00:00:00.000Z",
      durationMs: 1388 * 60_000,
    };
    const out = explainStructured(long, null, null, NOW);
    expect(out.likelyImpact).toContain("about 11 h 34 min to 34 h 42 min after the ground stop ends");
    const short = explainStructured({ ...active, endedAt: START, durationMs: 40 * 60_000 }, null, null, NOW);
    expect(short.likelyImpact).toContain("about 20 min to 1 h after");
  });

  test("ended incident uses the ground stop duration as the basis", () => {
    const ended: Incident = {
      ...active,
      endedAt: "2024-06-01T13:00:00.000Z",
      durationMs: 3_600_000,
    };
    const out = explainStructured(ended, "fog", null, NOW);
    expect(out.likelyImpact).toContain("based on a ground stop that lasted about 60 minutes");
    expect(out.nextUpdate).toBe("No further update expected. The ground stop ended at 2024-06-01 13:00 UTC.");
  });

  test("unmatched GROUND_STOP_ENDED event merges to an ended incident and still explains", () => {
    const [incident] = mergeIncidents([
      {
        type: "GROUND_STOP_ENDED",
        airportId: "ATL",
        occurredAt: START,
        faaEventId: "faa:9",
        reason: null,
        incidentKey: "orphan",
      },
    ]);
    const out = explainStructured(incident as Incident, null, null, NOW);
    expect(out.whatsHappening).toContain("has ended");
    expect(out.likelyImpact).toContain("about less than 1 min to 15 min");
    expect(Object.values(out).every((v) => v.length > 0)).toBe(true);
  });

  test("unrecognized reason text is not shown", () => {
    const out = explainStructured(active, "VOL:XYZ", null, NOW);
    expect(JSON.stringify(out)).not.toContain("VOL");
    expect(out.why).not.toBe(REASON_NOT_PUBLISHED);
  });

  test("nationwide incident has an estimate-free impact", () => {
    const n: Incident = { ...active, type: "NATIONWIDE_EVENT", airportId: null };
    const out = explainStructured(n, null, null, NOW);
    expect(out.nextUpdate).toBe(NOT_YET_ANNOUNCED);
    expect(out.likelyImpact).toContain("no estimate");
  });

  test("throws UnsupportedEventTypeError for an unknown incident type", () => {
    const bad = { ...active, type: "SOMETHING_ELSE" } as unknown as Incident;
    expect(() => explainStructured(bad, null, null, NOW)).toThrow(UnsupportedEventTypeError);
  });
});

