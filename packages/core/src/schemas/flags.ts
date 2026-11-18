import { z } from "zod";

/** Names of the Phase 2 feature flags, in a fixed order. */
export const FLAG_NAMES = [
  "FEATURE_DARK_MODE",
  "FEATURE_HIGH_CONTRAST",
  "FEATURE_DIGESTS",
  "FEATURE_WEBHOOKS",
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

/** Exactly "true" or "false" (case and whitespace sensitive). Anything else fails. */
export const flagValueSchema = z.enum(["true", "false"]).transform((v) => v === "true");

export const flagsSchema = z.object({
  FEATURE_DARK_MODE: flagValueSchema,
  FEATURE_HIGH_CONTRAST: flagValueSchema,
  FEATURE_DIGESTS: flagValueSchema,
  FEATURE_WEBHOOKS: flagValueSchema,
});

export type Flags = z.infer<typeof flagsSchema>;
