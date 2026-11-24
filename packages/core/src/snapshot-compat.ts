import { MONITORED_IDS } from "./airports";

function airportIdOf(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null || !("airportId" in entry)) return null;
  const id = (entry as { airportId: unknown }).airportId;
  return typeof id === "string" ? id : null;
}

/** Same comparison normalizeResponse uses; entries without a string airportId sort last. */
function byAirportId(a: unknown, b: unknown): number {
  const x = airportIdOf(a);
  const y = airportIdOf(b);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Completes the airports of a stored Snapshot written before the monitored list grew.
 * Input that is not an array is returned unchanged so SnapshotSchema reports the error.
 * Entries already present are kept as they are. Each missing monitored id is added with
 * `groundStop: null`. Output is sorted by airportId. Unknown ids are kept so the schema rejects them.
 * Pure: the input is not mutated.
 */
export function completeSnapshotAirports(stored: unknown): unknown {
  if (!Array.isArray(stored)) return stored;
  const present = new Set<string>();
  for (const entry of stored) {
    const id = airportIdOf(entry);
    if (id !== null) present.add(id);
  }
  const added = MONITORED_IDS.filter((id) => !present.has(id)).map((airportId) => ({
    airportId,
    groundStop: null,
  }));
  return [...(stored as unknown[]), ...added].sort(byAirportId);
}
