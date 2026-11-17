/** Pure readers for the magic-link fragment and the unsubscribe query string. */

/** The token in a `#token=...` fragment, or null when absent or empty. */
export function readTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token");
  return token === null || token === "" ? null : token;
}

export type UnsubscribeParams = { userId: string; airportId: string; sig: string };

/** `?u=&a=&sig=` as unsubscribe params, or null when any is missing or empty. */
export function readUnsubscribeParams(search: string): UnsubscribeParams | null {
  const q = new URLSearchParams(search);
  const userId = q.get("u");
  const airportId = q.get("a");
  const sig = q.get("sig");
  if (!userId || !airportId || !sig) return null;
  return { userId, airportId, sig };
}

/** User-facing text for a thrown value. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message !== "" ? err.message : fallback;
}
