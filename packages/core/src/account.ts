/**
 * Pure account rules: email validation, Magic_Link classification, rate limiting.
 * No I/O, no env reads; `now` is always passed in.
 */

export const EMAIL_MAX_LENGTH = 254;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const MAGIC_LINK_RATE_LIMIT = 5;
export const MAGIC_LINK_RATE_WINDOW_MS = 60 * 60 * 1000;

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export type EmailValidation = { ok: true; email: string } | { ok: false };

/** Trims and lower-cases, then checks syntax and the 254-character limit. */
export function validateEmail(input: string): EmailValidation {
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return { ok: false };
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return { ok: false };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local) || !DOMAIN.test(domain)) return { ok: false };
  return { ok: true, email };
}

/** Stored state of a Magic_Link. `createdAt` anchors the 15-minute expiry. */
export type LinkState = {
  createdAt: Date;
  usedAt: Date | null;
  invalidatedAt: Date | null;
};

export type MagicLinkClassification = "valid" | "expired" | "used" | "invalid";

/**
 * `null` (unknown token) and invalidated links are "invalid". A used link is "used".
 * Otherwise the link is "valid" while its age is under 15 minutes, matching the
 * redeem statement's `expires_at > now()`; at exactly 15 minutes it is "expired".
 * A link dated in the future relative to `now` is "valid".
 */
export function classifyMagicLink(link: LinkState | null, now: Date): MagicLinkClassification {
  if (link === null || link.invalidatedAt !== null) return "invalid";
  if (link.usedAt !== null) return "used";
  return now.getTime() - link.createdAt.getTime() >= MAGIC_LINK_TTL_MS ? "expired" : "valid";
}

/**
 * True when 5 or more requests fall in the preceding 60 minutes
 * (`now - 60 min <= t <= now`). Requests after `now` are not counted.
 */
export function isRateLimited(requestTimes: readonly Date[], now: Date): boolean {
  const nowMs = now.getTime();
  let count = 0;
  for (const t of requestTimes) {
    const ms = t.getTime();
    if (ms <= nowMs && nowMs - ms <= MAGIC_LINK_RATE_WINDOW_MS) count++;
  }
  return count >= MAGIC_LINK_RATE_LIMIT;
}
