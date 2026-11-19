// Feature: aerobrief-phase2, Property 7: Digest idempotency
// Validates: Requirements 11.5, 11.15
import { digestClaimKey } from "@aerobrief/core";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runDigest, type DigestFetch, type DigestRepositories } from "../src/digest";
import type { Env } from "../src/env";

const DATE = "2026-11-14";
const BASE_MS = Date.parse(`${DATE}T07:00:00.000Z`);
const HOUR_MS = 3_600_000;

const env = {
  DATABASE_URL: "postgres://user:dbpass@db.example.com/app",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
  FEATURE_DIGESTS: "true",
  SAFE_SEND_MODE: "false",
} satisfies Env;

type Outcome = "success" | "reject" | "timeout";
type FakeUser = { userId: string; enabled: boolean; hour: number; watched: number };

const userArb = fc.record({
  enabled: fc.boolean(),
  hour: fc.integer({ min: 7, max: 10 }),
  watched: fc.integer({ min: 0, max: 2 }),
});

const scenarioArb = fc.record({
  users: fc.array(userArb, { minLength: 1, maxLength: 4 }),
  // Each group runs concurrently (Promise.all); groups run one after another.
  // An offset is the run time after 07:00 UTC on the Digest_Date, 0 to 3h59m.
  groups: fc.array(fc.array(fc.integer({ min: 0, max: 4 * 60 - 1 }), { minLength: 1, maxLength: 3 }), {
    minLength: 1,
    maxLength: 4,
  }),
  outcomes: fc.array(fc.constantFrom<Outcome>("success", "reject", "timeout"), { minLength: 1, maxLength: 12 }),
});

describe("Property 7: Digest idempotency", () => {
  it("sends at most one digest per user and date across any sequence of runs", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ users: rawUsers, groups, outcomes }) => {
        const users: FakeUser[] = rawUsers.map((u, i) => ({ userId: `u${i}`, ...u }));

        // In-memory claim store that rejects duplicate keys.
        const claims = new Set<string>();
        let acceptedClaims = 0;
        const handedOff: string[] = [];
        let callIndex = 0;
        const sends: { key: string; to: string; ok: boolean }[] = [];
        let sleeps = 0;

        const fetchFn: DigestFetch = async (_url, init) => {
          const headers = init.headers as Record<string, string>;
          const to = (JSON.parse(init.body as string) as { to: string }).to;
          const outcome = outcomes[callIndex++ % outcomes.length] as Outcome;
          const key = headers["Idempotency-Key"] as string;
          if (outcome === "timeout") {
            sends.push({ key, to, ok: false });
            throw new DOMException("timed out", "TimeoutError");
          }
          const ok = outcome === "success";
          sends.push({ key, to, ok });
          return new Response("{}", { status: ok ? 200 : 500 });
        };

        const repos = {
          snapshots: { latestSnapshot: async () => null },
          events: { recentEvents: async () => [] },
          subscriptions: {
            usersWithWatchlist: async () => users.map((u) => ({ userId: u.userId, email: `${u.userId}@example.com` })),
            list: async () => [{ airportId: "JFK" }],
          },
          digest: {
            loadDueInputs: async () => ({
              prefs: users.map((u) => ({
                userId: u.userId,
                enabled: u.enabled,
                hour: u.hour,
                updatedAt: new Date("2026-11-01T00:00:00.000Z"),
              })),
              watchlistCounts: new Map(users.map((u) => [u.userId, u.watched])),
              claimedKeys: new Set(claims),
            }),
            claim: async (userId: string, digestDate: string) => {
              // Yield so concurrent runs interleave before the claim lands.
              await Promise.resolve();
              const k = digestClaimKey(userId, digestDate);
              if (claims.has(k)) return false;
              claims.add(k);
              acceptedClaims++;
              return true;
            },
            complete: async (i: { userId: string; digestDate: string; status: string }) => {
              if (i.status === "handed_off") handedOff.push(digestClaimKey(i.userId, i.digestDate));
            },
          },
        } satisfies DigestRepositories;

        const runAt = (offsetMin: number) => {
          const at = new Date(BASE_MS + offsetMin * 60_000);
          return runDigest(env, at, {
            createRepositories: () => repos,
            fetchFn,
            sleep: async () => void sleeps++,
            clock: () => at,
          });
        };

        for (const group of groups) await Promise.all(group.map(runAt));

        // The claim store never holds a duplicate: every accepted claim added a new key.
        expect(claims.size).toBe(acceptedClaims);

        // At most one handed_off per (user, digestDate).
        expect(new Set(handedOff).size).toBe(handedOff.length);

        // Every send used digest/<userId>/<digestDate>, reused across retries.
        for (const s of sends) {
          const userId = s.to.replace("@example.com", "");
          expect(s.key).toBe(`digest/${userId}/${DATE}`);
        }

        // Successful Resend calls per user are at most 1, and failed attempts never exceed 3 per claim.
        for (const u of users) {
          const mine = sends.filter((s) => s.to === `${u.userId}@example.com`);
          expect(mine.filter((s) => s.ok).length).toBeLessThanOrEqual(1);
          expect(mine.length).toBeLessThanOrEqual(3);
          if (!u.enabled || u.watched === 0) expect(mine.length).toBe(0);
        }
        expect(sleeps).toBeLessThanOrEqual(2 * users.length);
      }),
      { numRuns: 100 },
    );
  });
});
