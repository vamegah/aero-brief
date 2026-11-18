/** Longest advisory URL we accept, in characters. */
export const ADVISORY_URL_MAX_LENGTH = 2048;

/**
 * Accept an FAA advisory link only when it is a plain HTTPS URL on faa.gov or a
 * subdomain, with no embedded credentials. Returns the normalized href, or null.
 * Pure and never throws (Requirements 17.4, 17.5).
 */
export function acceptAdvisoryUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > ADVISORY_URL_MAX_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "faa.gov" && !host.endsWith(".faa.gov")) return null;
  if (url.href.length > ADVISORY_URL_MAX_LENGTH) return null;
  return url.href;
}
