import { isMonitoredId, type MonitoredId } from "@aerobrief/core/airports";
import { AIRPORT_STATUS_KINDS, type AirportStatusKind } from "@aerobrief/core/status-derivation";
import { WATCHLIST_CAP } from "@aerobrief/core/watchlist";

/** localStorage key for the signed-out watchlist. */
export const LOCAL_WATCHLIST_KEY = "aerobrief.localWatchlist";

/** The subset of Storage this module needs; injectable for tests. */
export type WatchlistStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): WatchlistStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Keeps monitored ids only, drops duplicates (first wins) and applies the cap. */
function sanitize(values: readonly unknown[]): MonitoredId[] {
  const seen = new Set<MonitoredId>();
  for (const v of values) {
    if (typeof v === "string" && isMonitoredId(v)) seen.add(v);
    if (seen.size >= WATCHLIST_CAP) break;
  }
  return [...seen];
}

/** Reads the Local_Watchlist. Missing, blocked or corrupt storage reads as empty. Never throws. */
export function readLocalWatchlist(storage: WatchlistStorage | null = defaultStorage()): MonitoredId[] {
  try {
    const raw = storage?.getItem(LOCAL_WATCHLIST_KEY);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitize(parsed) : [];
  } catch {
    return [];
  }
}

/** Saves the Local_Watchlist (sanitized). Returns false if storage is blocked or full. Never throws. */
export function writeLocalWatchlist(
  ids: readonly string[],
  storage: WatchlistStorage | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(sanitize(ids)));
    return true;
  } catch {
    return false;
  }
}

export interface MergeResult {
  /** Account entries first (in order), then local entries not already present, at most `cap`. */
  list: MonitoredId[];
  /** Number of unique combined ids that did not fit under the cap. */
  overflow: number;
}

/** Pure union of the account and local watchlists, account entries kept first, capped. */
export function mergeIntoAccount(
  local: readonly string[],
  account: readonly string[],
  cap: number = WATCHLIST_CAP,
): MergeResult {
  const combined = new Set<MonitoredId>();
  for (const id of [...account, ...local]) {
    if (isMonitoredId(id)) combined.add(id);
  }
  const all = [...combined];
  const limit = Math.max(0, cap);
  return { list: all.slice(0, limit), overflow: Math.max(0, all.length - limit) };
}

const SEVERITY_RANK: Readonly<Record<AirportStatusKind, number>> = Object.fromEntries(
  AIRPORT_STATUS_KINDS.map((kind, index) => [kind, index]),
) as Record<AirportStatusKind, number>;

/**
 * Orders airports most severe status first (display severity order), then by id.
 * Stable; does not mutate the input.
 */
export function sortBySeverity(
  airports: readonly MonitoredId[],
  statusOf: (id: MonitoredId) => AirportStatusKind,
): MonitoredId[] {
  return airports
    .map((id, index) => ({ id, index, rank: SEVERITY_RANK[statusOf(id)] }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.index - b.index))
    .map((e) => e.id);
}
