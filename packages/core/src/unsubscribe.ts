/**
 * Unsubscribe signature: sig = base64url(HMAC-SHA256(secret, userId + "." + airportId)).
 * Pure: uses Web Crypto only, the secret is an argument, no env reads.
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
    return out;
  } catch {
    return null;
  }
}

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function message(userId: string, airportId: string): Uint8Array {
  return encoder.encode(`${userId}.${airportId}`);
}

export async function signUnsubscribe(secret: string, userId: string, airportId: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, message(userId, airportId));
  return toBase64Url(new Uint8Array(mac));
}

/** Constant-time verification (Web Crypto `verify` compares the MAC in constant time). */
export async function verifyUnsubscribe(
  secret: string,
  userId: string,
  airportId: string,
  sig: string,
): Promise<boolean> {
  const sigBytes = fromBase64Url(sig);
  if (sigBytes === null) return false;
  const key = await importKey(secret, "verify");
  return crypto.subtle.verify("HMAC", key, sigBytes, message(userId, airportId));
}
