/** How fresh the displayed status data is (Requirement 9). */
export type Freshness = "live" | "delayed" | "unavailable";

export interface FreshnessInput {
  /** True once any status response has loaded. */
  hasData: boolean;
  /** The `stale` flag of the last loaded response. */
  stale: boolean;
  /** True when the most recent status request failed. */
  refreshFailed: boolean;
}

/**
 * No data ever loaded is Unavailable. Last known data that is stale or whose
 * refresh failed is Delayed. Otherwise Live.
 */
export function deriveFreshness({ hasData, stale, refreshFailed }: FreshnessInput): Freshness {
  if (!hasData) return "unavailable";
  if (stale || refreshFailed) return "delayed";
  return "live";
}

/** True when the live-region announcement should fire. */
export function freshnessChanged(prev: Freshness, next: Freshness): boolean {
  return prev !== next;
}
