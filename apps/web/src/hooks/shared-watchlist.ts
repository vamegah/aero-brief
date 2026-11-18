import { fetchWatchlist } from "../api/watchlist";

let pending: Promise<string[]> | null = null;

/**
 * GET /api/watchlist, shared while in flight. The nav bar's session check and the watchlist page
 * both load on the same render, so concurrent callers get one request and one result.
 * The shared request is not tied to any caller's AbortSignal; a caller that unmounts ignores the result.
 * Nothing is cached after it settles, so later loads and mutations always see fresh data.
 */
export function loadWatchlist(): Promise<string[]> {
  if (pending === null) {
    const request = fetchWatchlist().finally(() => {
      if (pending === request) pending = null;
    });
    pending = request;
  }
  return pending;
}
