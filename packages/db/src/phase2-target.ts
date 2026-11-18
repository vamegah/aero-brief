// Phase 2 migration target guard (Requirements 4.5, 4.6). Pure: no I/O, no env reads.
// Messages name hosts only. They never include the user, password, path or full URL.

export class Phase2TargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Phase2TargetError";
  }
}

/** Lower-cases a host and removes the Neon `-pooler` marker so pooled and direct hosts compare equal. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace("-pooler", "");
}

function hostOfUrl(databaseUrl: string): string | null {
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl.trim())) return null;
  try {
    const host = new URL(databaseUrl.trim()).hostname;
    return host === "" ? null : normalizeHost(host);
  } catch {
    return null;
  }
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/**
 * Throws Phase2TargetError unless databaseUrl points at the Phase2_Branch_DB host.
 * Refuses when: expectedHost is unset, the production host is unset (fail closed), the URL cannot
 * be parsed, expectedHost is the production host, the URL host is the production host, or the URL
 * host differs from expectedHost after removing `-pooler`.
 */
export function assertPhase2Target(
  databaseUrl: string | undefined,
  expectedHost: string | undefined,
  productionHost: string | undefined,
): void {
  if (!isSet(expectedHost)) {
    throw new Phase2TargetError("Refused: PHASE2_DB_HOST is not set, so the target cannot be verified.");
  }
  if (!isSet(productionHost)) {
    throw new Phase2TargetError("Refused: PRODUCTION_DB_HOST is not set, so the production database cannot be excluded.");
  }
  const expected = normalizeHost(expectedHost);
  const production = normalizeHost(productionHost);
  if (expected === production) {
    throw new Phase2TargetError(`Refused: PHASE2_DB_HOST equals the production host (${production}).`);
  }
  const actual = isSet(databaseUrl) ? hostOfUrl(databaseUrl) : null;
  if (actual === null) {
    throw new Phase2TargetError("Refused: the database URL is missing or is not a postgres:// URL with a host.");
  }
  if (actual === production) {
    throw new Phase2TargetError(`Refused target: ${actual} is the production database.`);
  }
  if (actual !== expected) {
    throw new Phase2TargetError(`Refused target: ${actual} is not the Phase 2 branch host ${expected}.`);
  }
}
