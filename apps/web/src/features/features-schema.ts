/**
 * Response shape of GET /api/features: one boolean per Phase 2 flag.
 * apps/web has no Zod dependency (no new dependencies allowed), so this is a small hand-written validator.
 * It accepts only a plain object with a boolean for each of the four keys; extra keys are ignored.
 */
export interface Features {
  darkMode: boolean;
  highContrast: boolean;
  digests: boolean;
  webhooks: boolean;
}

export const FEATURE_KEYS = ["darkMode", "highContrast", "digests", "webhooks"] as const;

export const ALL_FLAGS_OFF: Features = Object.freeze({
  darkMode: false,
  highContrast: false,
  digests: false,
  webhooks: false,
});

/** Returns the validated flags, or null when the body is not an object of four booleans. */
export function parseFeaturesResponse(body: unknown): Features | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const result: Features = { darkMode: false, highContrast: false, digests: false, webhooks: false };
  for (const key of FEATURE_KEYS) {
    const value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
    if (typeof value !== "boolean") return null;
    result[key] = value;
  }
  return result;
}
