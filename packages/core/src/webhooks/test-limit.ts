const LIMIT_MS = 60_000;

/**
 * Mirrors the SQL claim: `last_test_at IS NULL OR last_test_at <= now - 60 seconds`.
 * Exactly 60 s later is allowed. A lastTestAt in the future (clock skew) is not allowed.
 */
export function testEventAllowed(lastTestAt: Date | null, now: Date): boolean {
  if (lastTestAt === null) return true;
  return lastTestAt.getTime() <= now.getTime() - LIMIT_MS;
}

/** Whole seconds to wait before the next test event, always in 1..60. */
export function retryAfterSeconds(lastTestAt: Date | null, now: Date): number {
  if (lastTestAt === null) return 1;
  const remainingMs = lastTestAt.getTime() + LIMIT_MS - now.getTime();
  const seconds = Math.ceil(remainingMs / 1000);
  return Math.min(60, Math.max(1, seconds));
}
