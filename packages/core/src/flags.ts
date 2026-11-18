/**
 * Pure Phase 2 feature flag parsing. Separate from parseEnv.
 * Each flag is parsed on its own: "true" and "false" map to booleans,
 * an absent or any other value is off. A warning names the flag, never its value.
 */
import { FLAG_NAMES, flagValueSchema, type Flags } from "./schemas/flags";

export function parseFlags(raw: Record<string, string | undefined>): { flags: Flags; warnings: string[] } {
  const flags: Flags = {
    FEATURE_DARK_MODE: false,
    FEATURE_HIGH_CONTRAST: false,
    FEATURE_DIGESTS: false,
    FEATURE_WEBHOOKS: false,
  };
  const warnings: string[] = [];

  for (const name of FLAG_NAMES) {
    const value = Object.prototype.hasOwnProperty.call(raw, name) ? raw[name] : undefined;
    if (value === undefined) continue;
    const result = flagValueSchema.safeParse(value);
    if (result.success) {
      flags[name] = result.data;
    } else {
      warnings.push(`Invalid value for feature flag ${name}; treating it as off.`);
    }
  }

  return { flags, warnings };
}
