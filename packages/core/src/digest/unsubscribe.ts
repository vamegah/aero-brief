/**
 * Digest unsubscribe signature: sig = base64url(HMAC-SHA256(secret, "digest." + userId)).
 * Pure: Web Crypto only, secrets are arguments, no env reads.
 *
 * Separation from the per-airport signature (`${userId}.${airportId}`): the two messages can
 * only be equal when the per-airport userId is the literal text "digest". User ids are UUIDs
 * (hex digits and hyphens only), which cannot contain "g", "i" or "t", so no real User id
 * equals "digest" and a digest signature never verifies under `verifyUnsubscribe`, and the
 * reverse. Both are verified under the same secret, so the message text is the only separator.
 */
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes unpadded base64url; returns null for anything that is not valid base64url. */
function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    // Canonical form only: the final character carries unused trailing bits that atob ignores,
    // so two different strings could otherwise decode to the same bytes.
    return toBase64Url(out) === s ? out : null;
  } catch {
    return null;
  }
}

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function message(userId: string): Uint8Array {
  return encoder.encode(`digest.${userId}`);
}

export async function signDigestUnsubscribe(userId: string, secret: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, message(userId));
  return toBase64Url(new Uint8Array(mac));
}

/**
 * Constant-time verification (Web Crypto `verify`). Valid if any secret verifies the signature;
 * every secret is checked, with no early exit.
 */
export async function verifyDigestUnsubscribe(
  userId: string,
  sig: string,
  secrets: string | readonly string[],
): Promise<boolean> {
  const sigBytes = fromBase64Url(sig);
  if (sigBytes === null) return false;
  const list = typeof secrets === "string" ? [secrets] : secrets;
  let valid = false;
  for (const s of list) {
    const key = await importKey(s, "verify");
    if (await crypto.subtle.verify("HMAC", key, sigBytes, message(userId))) valid = true;
  }
  return valid;
}
