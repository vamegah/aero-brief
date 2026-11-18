import { createLogger, FLAG_NAMES, parseFlags, type Flags, type Logger } from "@aerobrief/core";

/**
 * Reads the Phase 2 feature flags from the Worker env. Call once per scheduled run.
 * Only the flag keys are copied from env, so no other binding (and no secret) reaches the parser.
 * Warnings name the flag, never its value.
 */
export function readFlags(
  env: object,
  logger: Logger = createLogger(),
): Flags {
  const source = env as Record<string, unknown>;
  const raw: Record<string, string | undefined> = {};
  for (const name of FLAG_NAMES) {
    const value = Object.prototype.hasOwnProperty.call(source, name) ? source[name] : undefined;
    // A non-string binding is invalid, not absent. Use a marker the parser rejects without logging it.
    raw[name] = value === undefined || typeof value === "string" ? value : "invalid";
  }
  const { flags, warnings } = parseFlags(raw);
  for (const warning of warnings) logger.warn(warning);
  return flags;
}
