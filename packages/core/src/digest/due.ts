export interface DigestPrefRow {
  userId: string;
  enabled: boolean;
  hour: number;
  updatedAt: Date;
}

export interface DueDigest {
  userId: string;
  digestDate: string;
  scheduledAt: Date;
}

const HOUR_MS = 3_600_000;
const CATCH_UP_HOURS = 3;

/** Claim key format: `${userId}|${digestDate}`. */
export function digestClaimKey(userId: string, digestDate: string): string {
  return `${userId}|${digestDate}`;
}

/**
 * Pure due-time selection. Offsets 0..3 whole hours back from `now`
 * truncated to the hour; hours are UTC. `digestDate` is the UTC date of
 * `scheduledAt`.
 */
export function selectDueDigests(args: {
  now: Date;
  prefs: readonly DigestPrefRow[];
  claimedKeys: ReadonlySet<string>;
  watchlistCounts: ReadonlyMap<string, number>;
}): DueDigest[] {
  const { now, prefs, claimedKeys, watchlistCounts } = args;
  const runHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const due: DueDigest[] = [];
  const seen = new Set<string>();

  for (const pref of prefs) {
    if (!pref.enabled || seen.has(pref.userId)) continue;
    for (let k = 0; k <= CATCH_UP_HOURS; k++) {
      const scheduledAt = new Date(runHour - k * HOUR_MS);
      if (scheduledAt.getUTCHours() !== pref.hour) continue;
      if (pref.updatedAt.getTime() > scheduledAt.getTime()) break;
      if ((watchlistCounts.get(pref.userId) ?? 0) <= 0) break;
      const digestDate = scheduledAt.toISOString().slice(0, 10);
      if (claimedKeys.has(digestClaimKey(pref.userId, digestDate))) break;
      seen.add(pref.userId);
      due.push({ userId: pref.userId, digestDate, scheduledAt });
      break;
    }
  }
  return due;
}
