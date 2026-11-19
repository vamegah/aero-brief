/**
 * Derived webhook secrets (Req 13.10, 13.11).
 * secret = "whsec_" + base64url(HMAC-SHA256(utf8(master), utf8("aerobrief.webhook.v1." + webhookId))).
 * base64url is unpadded (RFC 4648 section 5), so the 32-byte MAC encodes to 43 characters.
 * Pure: Web Crypto only, the master secret is an argument, no env reads.
 */
export const WEBHOOK_SECRET_PREFIX = "whsec_";
export const WEBHOOK_MASTER_MIN_LENGTH = 32;
const DOMAIN_PREFIX = "aerobrief.webhook.v1.";
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function deriveWebhookSecret(master: string, webhookId: string): Promise<string> {
  if (master.length < WEBHOOK_MASTER_MIN_LENGTH) {
    // The message names no secret value, not even its length.
    throw new Error("Webhook master secret is too short");
  }
  const key = await crypto.subtle.importKey("raw", encoder.encode(master), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(DOMAIN_PREFIX + webhookId));
  return WEBHOOK_SECRET_PREFIX + toBase64Url(new Uint8Array(mac));
}
