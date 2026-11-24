/**
 * Pure Watchlist operations. Cap 30, monitored airports only, idempotent add and remove.
 */
import { isMonitoredId, type MonitoredId } from "./airports";

export const WATCHLIST_CAP = 30;

export type WatchlistOp = { type: "add" | "remove"; airportId: string };

export type WatchlistResult =
  | { ok: true; list: readonly MonitoredId[] }
  | { ok: false; error: "unmonitored" | "cap_exceeded" };

/**
 * add: unmonitored id is rejected; an id already present succeeds unchanged (even on a
 * full list); a new id on a full list is rejected; otherwise it is appended.
 * remove: absent or unmonitored ids succeed unchanged.
 * Never mutates `list`.
 */
export function applyWatchlistOp(list: readonly MonitoredId[], op: WatchlistOp): WatchlistResult {
  const id = op.airportId;
  if (op.type === "remove") {
    return { ok: true, list: list.filter((x) => x !== id) };
  }
  if (!isMonitoredId(id)) return { ok: false, error: "unmonitored" };
  if (list.includes(id)) return { ok: true, list: [...list] };
  if (list.length >= WATCHLIST_CAP) return { ok: false, error: "cap_exceeded" };
  return { ok: true, list: [...list, id] };
}
