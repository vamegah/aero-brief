import { AIRPORTS, createLogger, nationwideStatus, type Snapshot } from "@aerobrief/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";
import {
  createStatusHandlers,
  type NationalStatusResponse,
  type StatusDeps,
  type StatusEventRow,
} from "../src/handlers/status";
import type { RouteContext } from "../src/router";

const NOW = new Date("2025-01-02T12:00:00.000Z");
const env = parseEnv({
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
});

const NATIONWIDE_MIN_ARTCCS = 3;

/** Local arbitrary: each of the 20 airports independently has a ground stop or not. */
const stopFlagsArb: fc.Arbitrary<boolean[]> = fc.array(fc.boolean(), {
  minLength: AIRPORTS.length,
  maxLength: AIRPORTS.length,
});

/** Biased arbitrary that often lands near the threshold (0 to 5 distinct ARTCCs). */
const nearThresholdFlagsArb: fc.Arbitrary<boolean[]> = fc
  .uniqueArray(fc.constantFrom(...AIRPORTS.map((a) => a.id)), { minLength: 0, maxLength: 6 })
  .map((ids) => AIRPORTS.map((a) => ids.includes(a.id)));

const snapshotArb: fc.Arbitrary<Snapshot> = fc
  .tuple(fc.oneof(stopFlagsArb, nearThresholdFlagsArb), fc.uuid())
  .map(([flags, id]) => ({
    id,
    capturedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    airports: AIRPORTS.map((a, i) => ({
      airportId: a.id,
      groundStop: flags[i]
        ? { faaEventId: `faa-${a.id}`, idSource: "faa_id" as const, reason: null, center: null, endTime: null, expectedEnd: null, advisoryUrl: null }
        : null,
    })),
  }));

function ctx(): RouteContext {
  return {
    params: {},
    session: null,
    now: NOW,
    body: undefined,
    url: new URL("https://api.example.com/api/status/national"),
    signal: new AbortController().signal,
    logger: createLogger([]),
  };
}

async function callNational(snap: Snapshot): Promise<NationalStatusResponse> {
  const deps: StatusDeps = {
    latestSnapshot: (): Promise<Snapshot | null> => Promise.resolve(snap),
    recentEvents: (): Promise<readonly StatusEventRow[]> => Promise.resolve([]),
  };
  const { national } = createStatusHandlers(deps);
  const res = await national(new Request("https://api.example.com/api/status/national"), env, ctx());
  return (await res.json()) as NationalStatusResponse;
}

/** Independent oracle: distinct ARTCCs among airports with a ground stop. */
function distinctArtccs(snap: Snapshot): string[] {
  const byId = new Map<string, string>(AIRPORTS.map((a) => [a.id, a.artcc]));
  const set = new Set<string>();
  for (const a of snap.airports) {
    const artcc = byId.get(a.airportId);
    if (a.groundStop !== null && artcc !== undefined) set.add(artcc);
  }
  return [...set].sort();
}

describe("nationwide status threshold", () => {
  // Feature: aerobrief, Property 11: Nationwide status threshold
  // **Validates: Requirements 4.4, 4.5, 4.8**
  it("nationwideStatus is active iff 3 or more distinct ARTCCs are affected", () => {
    fc.assert(
      fc.property(snapshotArb, (snap) => {
        const expected = distinctArtccs(snap);
        const status = nationwideStatus(snap);
        expect(status.active).toBe(expected.length >= NATIONWIDE_MIN_ARTCCS);
        expect(status.count).toBe(expected.length);
        expect([...status.artccs]).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: aerobrief, Property 11: Nationwide status threshold
  // **Validates: Requirements 4.4, 4.5, 4.8**
  it("/api/status/national mirrors nationwideStatus and sets explanation only when active", async () => {
    await fc.assert(
      fc.asyncProperty(snapshotArb, async (snap) => {
        const body = await callNational(snap);
        expect(body.state).toBe("ok");
        if (body.state !== "ok") return;
        const expected = distinctArtccs(snap);
        const active = expected.length >= NATIONWIDE_MIN_ARTCCS;
        expect(body.nationwide.active).toBe(active);
        expect(body.nationwide.active).toBe(nationwideStatus(snap).active);
        expect(body.nationwide.count).toBe(expected.length);
        if (active) {
          expect(body.nationwide.explanation).not.toBeNull();
          expect(typeof body.nationwide.explanation).toBe("string");
          expect((body.nationwide.explanation ?? "").length).toBeGreaterThan(0);
        } else {
          expect(body.nationwide.explanation).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });
});
