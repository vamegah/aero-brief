import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  selectDueDigests,
  digestClaimKey,
  type DigestPrefRow,
} from "../src/digest/due";

// Feature: aerobrief-phase2, Property 6: Due-digest selection
// **Validates: Requirements 11.2, 11.3, 11.4, 11.14**

const HOUR = 3_600_000;
const NOW_MIN = Date.UTC(2026, 0, 1);
const NOW_MAX = Date.UTC(2027, 11, 31, 23, 59, 59, 999);

const nowArb = fc.integer({ min: NOW_MIN, max: NOW_MAX }).map((t) => new Date(t));
const userIds = ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"];

/** Pref updatedAt is generated relative to now, so both sides of scheduledAt occur. */
const prefArb = (now: Date, userId: fc.Arbitrary<string>) =>
  fc.record({
    userId,
    enabled: fc.boolean(),
    hour: fc.integer({ min: 0, max: 23 }),
    updatedAt: fc
      .integer({ min: -30 * 3600, max: 2 * 3600 })
      .map((s) => new Date(now.getTime() + s * 1000)),
  });

const uniquePrefsArb = (now: Date) =>
  fc
    .uniqueArray(fc.constantFrom(...userIds), { maxLength: userIds.length })
    .chain((ids) =>
      fc.tuple(...ids.map((id) => prefArb(now, fc.constant(id)))),
    );

interface Scenario {
  now: Date;
  prefs: DigestPrefRow[];
  counts: Map<string, number>;
  claimed: Set<string>;
}

const scenarioArb = (unique: boolean): fc.Arbitrary<Scenario> =>
  nowArb.chain((now) =>
    fc
      .tuple(
        unique
          ? uniquePrefsArb(now)
          : fc.array(prefArb(now, fc.constantFrom(...userIds)), { maxLength: 16 }),
        fc.array(fc.tuple(fc.constantFrom(...userIds), fc.integer({ min: 0, max: 3 })), {
          maxLength: 8,
        }),
        fc.array(
          fc.tuple(fc.constantFrom(...userIds), fc.integer({ min: -1, max: 4 })),
          { maxLength: 12 },
        ),
      )
      .map(([prefs, counts, claims]) => ({
        now,
        prefs: prefs as DigestPrefRow[],
        counts: new Map(counts),
        claimed: new Set(
          claims.map(([u, daysBack]) =>
            digestClaimKey(
              u,
              new Date(now.getTime() - daysBack * 24 * HOUR).toISOString().slice(0, 10),
            ),
          ),
        ),
      })),
  );

/** Reference model: the candidate (scheduledAt) for a pref, if it qualifies. */
function modelCandidate(s: Scenario, p: DigestPrefRow): { scheduledAt: number; digestDate: string } | null {
  if (!p.enabled) return null;
  if ((s.counts.get(p.userId) ?? 0) <= 0) return null;
  const runHour = Math.floor(s.now.getTime() / HOUR) * HOUR;
  for (let k = 0; k <= 3; k++) {
    const at = runHour - k * HOUR;
    if (new Date(at).getUTCHours() !== p.hour) continue;
    if (p.updatedAt.getTime() > at) return null;
    const digestDate = new Date(at).toISOString().slice(0, 10);
    if (s.claimed.has(`${p.userId}|${digestDate}`)) return null;
    return { scheduledAt: at, digestDate };
  }
  return null;
}

describe("Property 6: Due-digest selection", () => {
  it("matches the reference model: sound, complete, and correctly dated", () => {
    fc.assert(
      fc.property(scenarioArb(true), (s) => {
        const out = selectDueDigests({
          now: s.now,
          prefs: s.prefs,
          claimedKeys: s.claimed,
          watchlistCounts: s.counts,
        });
        const expected = new Map<string, { scheduledAt: number; digestDate: string }>();
        for (const p of s.prefs) {
          const c = modelCandidate(s, p);
          if (c) expected.set(p.userId, c);
        }
        // at most once
        expect(new Set(out.map((d) => d.userId)).size).toBe(out.length);
        // soundness + completeness
        expect(new Set(out.map((d) => d.userId))).toEqual(new Set(expected.keys()));
        const lower = Math.floor(s.now.getTime() / HOUR) * HOUR - 3 * HOUR;
        for (const d of out) {
          const e = expected.get(d.userId)!;
          const t = d.scheduledAt.getTime();
          expect(t).toBe(e.scheduledAt);
          expect(d.digestDate).toBe(e.digestDate);
          expect(d.scheduledAt.getUTCMinutes()).toBe(0);
          expect(d.scheduledAt.getUTCSeconds()).toBe(0);
          expect(d.scheduledAt.getUTCMilliseconds()).toBe(0);
          expect(t).toBeGreaterThanOrEqual(lower);
          expect(t).toBeLessThanOrEqual(s.now.getTime());
          expect(d.digestDate).toBe(d.scheduledAt.toISOString().slice(0, 10));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("returns each user at most once even with duplicate pref rows", () => {
    fc.assert(
      fc.property(scenarioArb(false), (s) => {
        const out = selectDueDigests({
          now: s.now,
          prefs: s.prefs,
          claimedKeys: s.claimed,
          watchlistCounts: s.counts,
        });
        expect(new Set(out.map((d) => d.userId)).size).toBe(out.length);
      }),
      { numRuns: 200 },
    );
  });

  it("catches up a missed hour-23 run after midnight with the previous date", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 364 }),
        fc.integer({ min: 0, max: HOUR - 1 }),
        (day, offset) => {
          // Run at 00:xx UTC; the user's 23:00 run on the previous day was missed.
          const midnight = Date.UTC(2026, 0, 2) + day * 24 * HOUR;
          const now = new Date(midnight + offset);
          const prevDate = new Date(midnight - HOUR).toISOString().slice(0, 10);
          const pref: DigestPrefRow = {
            userId: "u",
            enabled: true,
            hour: 23,
            updatedAt: new Date(midnight - 48 * HOUR),
          };
          const base = { now, prefs: [pref], watchlistCounts: new Map([["u", 1]]) };
          const out = selectDueDigests({ ...base, claimedKeys: new Set() });
          expect(out).toHaveLength(1);
          expect(out[0]!.digestDate).toBe(prevDate);
          expect(out[0]!.scheduledAt.getTime()).toBe(midnight - HOUR);
          // Once claimed for the previous date, it is not selected again.
          const claimed = new Set([digestClaimKey("u", prevDate)]);
          expect(selectDueDigests({ ...base, claimedKeys: claimed })).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
