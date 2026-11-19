/**
 * Safe_Send_Mode helpers (Phase 2, Req 5.3-5.8). Pure: callers read env vars
 * and pass raw strings in.
 */

/** Always allowed for email, never for hosts. */
export const ALWAYS_ALLOWED_EMAIL = "delivered@resend.dev";

/** Absent or anything but the exact string "false" means on. */
export function isSafeSendMode(raw: string | boolean | null | undefined): boolean {
  return raw !== "false" && raw !== false;
}

/** Comma-separated string to trimmed, lowercased, de-duplicated, non-empty entries. */
export function parseAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const entry = part.trim().toLowerCase();
    if (entry !== "") out.add(entry);
  }
  return [...out];
}

/** Email allowlist: parsed entries plus `delivered@resend.dev`. */
export function parseEmailAllowlist(raw: string | null | undefined): string[] {
  return parseAllowlist(`${raw ?? ""},${ALWAYS_ALLOWED_EMAIL}`);
}

/** Host allowlist: parsed entries only. No built-in host. */
export function parseHostAllowlist(raw: string | null | undefined): string[] {
  return parseAllowlist(raw);
}

/**
 * Keeps items whose key (trimmed, lowercased) is exactly in the allowlist
 * (entries are also trimmed and lowercased). An empty allowlist returns [].
 * Use parseEmailAllowlist to include the always-allowed email address.
 */
export function filterAllowlisted<T>(
  items: readonly T[],
  allowlist: readonly string[],
  keyOf: (item: T) => string,
): T[] {
  const allowed = new Set(allowlist.map((e) => e.trim().toLowerCase()));
  return items.filter((item) => allowed.has(keyOf(item).trim().toLowerCase()));
}
