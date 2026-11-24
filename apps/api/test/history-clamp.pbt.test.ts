import { RETENTION_MS, createLogger } from "@aerobrief/core";
import type { Snapshot } from "@aerobrief/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";
import { createStatusHandlers, type HistoryResponse, type StatusDeps, type StatusEventRow } from "../src/handlers/status";
import type { RouteContext } from "../src/router";

const NOW = new Date("2025-01-02T12:00:00.000Z");
const HOUR_MS = 3_600_000;
const TEN_YEARS_MS = 10 * 365 * 24 * HOUR_MS;

const env = parseEnv({
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
});

/** In-memory fake. Returns every stored row so the handler's own clamp is what is under test. */
function makeDeps(rows: readonly StatusEventRow[]): StatusDeps {
  return {
    latestSnapshot: (): Promise<Snapshot | null> => Promise.resolve(null),
    recentEvents: (): Promise<readonly StatusEventRow[]> => Promise.resolve(rows),
  };
}

function makeCtx(code: string, since: string): RouteContext {
  const url = new URL("https://api.example.com/api/history/" + code);
  url.searchParams.set("since", since);
  return {
    params: { code },
    session: null,
    now: NOW,
    body: undefined,
    url,
    signal: new AbortController().signal,
    logger: createLogger([]),
  };
}

// Offsets relative to NOW in ms. Events span 48 h back up to now; `since` spans far past to far future.
const eventOffsetArb = fc.integer({ min: -48 * HOUR_MS, max: 0 });
const sinceOffsetArb = fc.oneof(
  fc.integer({ min: -TEN_YEARS_MS, max: -RETENTION_MS - 1 }), // older than 24 h
  fc.integer({ min: -RETENTION_MS, max: 0 }), // inside window
  fc.integer({ min: 1, max: TEN_YEARS_MS }), // future
  fc.constantFrom(-RETENTION_MS, 0, -RETENTION_MS - 1, -TEN_YEARS_MS, TEN_YEARS_MS),
);

describe("history handler since clamping", () => {
  // Feature: aerobrief, Property 31: History request clamping
  it("Property 31: returns only Events from the last 24 hours for any since value, without failing", async () => {
    // **Validates: Requirements 11.7**
    await fc.assert(
      fc.asyncProperty(
        fc.array(eventOffsetArb, { maxLength: 30 }),
        sinceOffsetArb,
        async (eventOffsets, sinceOffset) => {
          const rows: StatusEventRow[] = eventOffsets.map((o, i) => ({
            eventKey: `evt-${i}`,
            type: "GROUND_STOP_STARTED",
            airportId: "JFK",
            occurredAt: new Date(NOW.getTime() + o),
            explanation: `event ${i}`,
          }));
          const h = createStatusHandlers(makeDeps(rows)).history;
          const sinceMs = NOW.getTime() + sinceOffset;
          const res = await h(
            new Request("https://api.example.com/api/history/JFK"),
            env,
            makeCtx("JFK", new Date(sinceMs).toISOString()),
          );

          // Never fails because of the age of `since`.
          expect(res.status).toBe(200);
          const body = (await res.json()) as HistoryResponse;
          expect(body.airportId).toBe("JFK");

          const floor = NOW.getTime() - RETENTION_MS;
          const effectiveSince = Math.max(sinceMs, floor);
          const returned = body.events.map((e) => Date.parse(e.occurredAt));

          // Nothing older than 24 h, nothing older than `since`.
          for (const t of returned) {
            expect(t).toBeGreaterThanOrEqual(floor);
            expect(t).toBeGreaterThanOrEqual(effectiveSince);
          }

          // Everything inside the effective window is returned, newest first.
          const expected = eventOffsets
            .map((o) => NOW.getTime() + o)
            .filter((t) => t >= effectiveSince)
            .sort((a, b) => b - a);
          expect(returned).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
