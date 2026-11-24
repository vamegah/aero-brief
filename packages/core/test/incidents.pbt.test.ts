import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { MONITORED_IDS } from "../src/airports";
import type { DetectedEvent } from "../src/change-detector";
import { mergeIncidents, sortIncidents, type Incident } from "../src/incidents";

const T0 = 1_700_000_000_000;
const iso = (n: number): string => new Date(n).toISOString();

const airportArb = fc.constantFrom(...MONITORED_IDS);

type KeyedEvent = DetectedEvent & { incidentKey: string };

/** One scenario per distinct key: started only, started+ended, ended only, or nationwide. */
const scenarioArb = fc.record({
  kind: fc.constantFrom("open", "closed", "orphanEnd", "nationwide"),
  airportId: airportArb,
  start: fc.integer({ min: 0, max: 10_000_000 }),
  length: fc.integer({ min: 0, max: 10_000_000 }),
});

const eventsArb = fc
  .array(scenarioArb, { maxLength: 12 })
  .chain((scenarios) =>
    fc
      .shuffledSubarray(
        scenarios.flatMap((s, i) => buildEvents(s, `key-${i}`)),
        { minLength: 0 },
      )
      .map((events) => ({ scenarios, events })),
  );

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

function buildEvents(s: Scenario, key: string): KeyedEvent[] {
  const startedAt = iso(T0 + s.start);
  const endedAt = iso(T0 + s.start + s.length);
  const gs = (type: "GROUND_STOP_STARTED" | "GROUND_STOP_ENDED", at: string): KeyedEvent => ({
    type,
    airportId: s.airportId,
    occurredAt: at,
    faaEventId: key,
    reason: null,
    incidentKey: key,
  });
  switch (s.kind) {
    case "open":
      return [gs("GROUND_STOP_STARTED", startedAt)];
    case "closed":
      return [gs("GROUND_STOP_STARTED", startedAt), gs("GROUND_STOP_ENDED", endedAt)];
    case "orphanEnd":
      return [gs("GROUND_STOP_ENDED", endedAt)];
    case "nationwide":
      return [
        {
          type: "NATIONWIDE_EVENT",
          occurredAt: startedAt,
          count: 3,
          affectedArtccs: ["ZNY", "ZDC", "ZBW"],
          incidentKey: `NATIONWIDE:${key}`,
        },
      ];
  }
}

describe("mergeIncidents", () => {
  // Feature: ui-improvements, Property 5: Incident merging drops no event and pairs correctly
  // **Validates: Requirements 2.1**
  test("Property 5: one Incident per distinct key; active iff a start has no end; no event dropped", () => {
    fc.assert(
      fc.property(eventsArb, ({ events }) => {
        const incidents = mergeIncidents(events);
        const keys = new Set(events.map((e) => e.incidentKey));

        expect(incidents.length).toBe(keys.size);
        expect(new Set(incidents.map((i) => i.incidentKey))).toEqual(keys);

        for (const inc of incidents) {
          const group = events.filter((e) => e.incidentKey === inc.incidentKey);
          const hasEnd = group.some((e) => e.type === "GROUND_STOP_ENDED");
          const hasStart = group.some((e) => e.type !== "GROUND_STOP_ENDED");
          expect(inc.endedAt === null).toBe(hasStart && !hasEnd);
          expect(inc.durationMs === null).toBe(inc.endedAt === null);
          if (inc.durationMs !== null) expect(inc.durationMs).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});

const incidentArb: fc.Arbitrary<Incident> = fc
  .record({
    incidentKey: fc.constantFrom("a", "b", "c", "d", "e"),
    type: fc.constantFrom("GROUND_STOP_STARTED" as const, "NATIONWIDE_EVENT" as const),
    airportId: fc.option(airportArb, { nil: null }),
    start: fc.integer({ min: 0, max: 100 }),
    length: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  })
  .map((r) => ({
    incidentKey: r.incidentKey,
    type: r.type,
    airportId: r.airportId,
    startedAt: iso(T0 + r.start * 1000),
    endedAt: r.length === null ? null : iso(T0 + (r.start + r.length) * 1000),
    durationMs: r.length === null ? null : r.length * 1000,
  }));

const permutedArb = fc
  .array(incidentArb, { maxLength: 15 })
  .chain((list) =>
    fc
      .shuffledSubarray(list, { minLength: list.length, maxLength: list.length })
      .map((permuted) => ({ list, permuted })),
  );

describe("sortIncidents", () => {
  // Feature: ui-improvements, Property 6: Incident sorting is active-first, then most-recent-end-first
  // **Validates: Requirements 2.5**
  test("Property 6: active first, then endedAt descending; permutation-invariant", () => {
    fc.assert(
      fc.property(permutedArb, ({ list, permuted }) => {
        const sorted = sortIncidents(list);
        expect(sorted.length).toBe(list.length);

        const firstEnded = sorted.findIndex((i) => i.endedAt !== null);
        if (firstEnded !== -1) {
          expect(sorted.slice(firstEnded).every((i) => i.endedAt !== null)).toBe(true);
        }
        const ended = sorted.filter((i) => i.endedAt !== null);
        for (let i = 1; i < ended.length; i++) {
          expect(Date.parse(ended[i - 1]!.endedAt!)).toBeGreaterThanOrEqual(
            Date.parse(ended[i]!.endedAt!),
          );
        }

        expect(sortIncidents(permuted)).toEqual(sorted);
      }),
      { numRuns: 200 },
    );
  });
});
