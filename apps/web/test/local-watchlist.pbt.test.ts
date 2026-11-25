import { MONITORED_IDS, type MonitoredId } from "@aerobrief/core/airports";
import { AIRPORT_STATUS_KINDS, type AirportStatusKind } from "@aerobrief/core/status-derivation";
import { WATCHLIST_CAP } from "@aerobrief/core/watchlist";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LOCAL_WATCHLIST_KEY,
  mergeIntoAccount,
  readLocalWatchlist,
  sortBySeverity,
  writeLocalWatchlist,
  type WatchlistStorage,
} from "../src/lib/local-watchlist";

const NUM_RUNS = 200;

const idList = (max: number) => fc.array(fc.constantFrom(...MONITORED_IDS), { maxLength: max });
const uniqueIds = (max: number) => fc.uniqueArray(fc.constantFrom(...MONITORED_IDS), { maxLength: max });

function memoryStorage(initial?: string): WatchlistStorage & { value: string | null } {
  const s = {
    value: initial ?? null,
    getItem: () => s.value,
    setItem: (_k: string, v: string) => {
      s.value = v;
    },
  };
  return s;
}

describe("local watchlist", () => {
  // Feature: ui-improvements, Property 8: Local watchlist merge respects the cap and reports overflow
  // **Validates: Requirements 4.3**
  it("Property 8: merge is a capped union, account first, no duplicates, overflow reported", () => {
    fc.assert(
      fc.property(idList(60), uniqueIds(WATCHLIST_CAP), (local, account) => {
        const { list, overflow } = mergeIntoAccount(local, account, WATCHLIST_CAP);
        const union = [...new Set<string>([...account, ...local])];
        expect(list.length).toBeLessThanOrEqual(WATCHLIST_CAP);
        expect(new Set(list).size).toBe(list.length);
        expect(list.every((id) => MONITORED_IDS.includes(id))).toBe(true);
        expect(list).toEqual(union.slice(0, WATCHLIST_CAP));
        expect(list.slice(0, account.length)).toEqual(account);
        expect(overflow).toBe(Math.max(0, union.length - WATCHLIST_CAP));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 4.1, 4.3**
  it("Property 8: stored lists never exceed the cap, hold only monitored unique ids", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.constantFrom(...MONITORED_IDS), fc.string()), { maxLength: 80 }), (ids) => {
        const storage = memoryStorage();
        writeLocalWatchlist(ids, storage);
        const read = readLocalWatchlist(storage);
        expect(read.length).toBeLessThanOrEqual(WATCHLIST_CAP);
        expect(new Set(read).size).toBe(read.length);
        expect(read.every((id) => MONITORED_IDS.includes(id))).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 4.1**
  it("Property 8: corrupt storage reads as empty and never throws", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string().filter((s) => {
            try {
              return !Array.isArray(JSON.parse(s));
            } catch {
              return true;
            }
          }),
          fc.constant("{\"a\":1}"),
          fc.constant("null"),
        ),
        (raw) => {
          expect(readLocalWatchlist(memoryStorage(raw))).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("tolerates missing, throwing and full storage", () => {
    const throwing: WatchlistStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readLocalWatchlist(null)).toEqual([]);
    expect(readLocalWatchlist(throwing)).toEqual([]);
    expect(writeLocalWatchlist(["ATL"], null)).toBe(false);
    expect(writeLocalWatchlist(["ATL"], throwing)).toBe(false);
    const ok = memoryStorage();
    expect(writeLocalWatchlist(["ATL", "ATL", "ZZZ", "DFW"], ok)).toBe(true);
    expect(ok.value).toBe(JSON.stringify(["ATL", "DFW"]));
    expect(LOCAL_WATCHLIST_KEY).toBeTruthy();
  });

  // Feature: ui-improvements, Property 9: Severity sort is a total order consistent with status
  // **Validates: Requirements 4.5**
  it("Property 9: a more severe status never appears after a less severe one", () => {
    const statusMapArb = fc.dictionary(
      fc.constantFrom(...MONITORED_IDS),
      fc.constantFrom<AirportStatusKind>(...AIRPORT_STATUS_KINDS),
    );
    fc.assert(
      fc.property(uniqueIds(30), statusMapArb, (ids, map) => {
        const statusOf = (id: MonitoredId): AirportStatusKind => map[id] ?? "normal";
        const sorted = sortBySeverity(ids, statusOf);
        expect([...sorted].sort()).toEqual([...ids].sort());
        const rank = (id: MonitoredId) => AIRPORT_STATUS_KINDS.indexOf(statusOf(id));
        for (let i = 1; i < sorted.length; i++) {
          expect(rank(sorted[i - 1]!)).toBeLessThanOrEqual(rank(sorted[i]!));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
