import { parseFlags, type Flags, type Logger } from "@aerobrief/core";
import { jsonResponse } from "./http";
import type { Handler } from "./router";

export const ALL_FLAGS_OFF: Flags = {
  FEATURE_DARK_MODE: false,
  FEATURE_HIGH_CONTRAST: false,
  FEATURE_DIGESTS: false,
  FEATURE_WEBHOOKS: false,
};

export function anyFlagOn(flags: Flags): boolean {
  return Object.values(flags).some((v) => v);
}

/** Copies the string-valued entries of the raw Worker env. Flags never come from parseEnv. */
function stringEntries(rawEnv: unknown): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (typeof rawEnv !== "object" || rawEnv === null) return out;
  for (const [key, value] of Object.entries(rawEnv)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * Builds a flag reader that parses the raw env once per env object and logs each warning once.
 * Warnings name the flag, never its value.
 */
export function createFlagReader(logger: Logger): (rawEnv: unknown) => Flags {
  const cache = new WeakMap<object, Flags>();
  return (rawEnv) => {
    const isObject = typeof rawEnv === "object" && rawEnv !== null;
    if (isObject) {
      const cached = cache.get(rawEnv);
      if (cached) return cached;
    }
    const { flags, warnings } = parseFlags(stringEntries(rawEnv));
    for (const reason of warnings) logger.warn("invalid_feature_flag", { reason });
    if (isObject) cache.set(rawEnv, flags);
    return flags;
  };
}

/** GET /api/features. No cookie, no database. Only reachable while at least one flag is on. */
export const featuresHandler: Handler = async (_req, _env, ctx) => {
  const flags = ctx.flags ?? ALL_FLAGS_OFF;
  return jsonResponse(
    200,
    {
      darkMode: flags.FEATURE_DARK_MODE,
      highContrast: flags.FEATURE_HIGH_CONTRAST,
      digests: flags.FEATURE_DIGESTS,
      webhooks: flags.FEATURE_WEBHOOKS,
    },
    { "Cache-Control": "no-store" },
  );
};
