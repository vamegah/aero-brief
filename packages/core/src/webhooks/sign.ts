/**
 * Webhook signing and verification (Req 15.2, 15.5, 15.6).
 * Web Crypto only. The key is the full `whsec_...` string as UTF-8 bytes.
 */

const SIGNATURE_PREFIX = "v1=";
const SIGNATURE_PATTERN = /^v1=[0-9a-f]{64}$/;
const TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

/** Copies into a fresh ArrayBuffer-backed array so it is a valid BufferSource under every TS lib. */
function utf8(text: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(text);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Returns `v1=` plus lowercase hex of HMAC-SHA256(secret, `${timestamp}.${body}`). */
export async function signWebhook(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, utf8(`${timestamp}.${body}`));
  return SIGNATURE_PREFIX + toHex(new Uint8Array(mac));
}

export interface VerifyWebhookInput {
  secret: string;
  timestamp: number;
  body: string;
  signatureHeader: string;
  nowSeconds: number;
}

/** True only for a well-formed header, a timestamp within 300 s (inclusive) and a matching MAC. */
export async function verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
  const { secret, timestamp, body, signatureHeader, nowSeconds } = input;
  if (typeof signatureHeader !== "string" || !SIGNATURE_PATTERN.test(signatureHeader)) return false;
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowSeconds)) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const key = await importKey(secret, "verify");
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(signatureHeader.slice(SIGNATURE_PREFIX.length)),
    utf8(`${timestamp}.${body}`),
  );
}
