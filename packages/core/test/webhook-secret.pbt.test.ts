// Feature: aerobrief-phase2, Property 14: Webhook secret derivation
// **Validates: Requirements 13.10, 13.11**
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { WEBHOOK_MASTER_MIN_LENGTH, WEBHOOK_SECRET_PREFIX, deriveWebhookSecret } from "../src/webhooks/secret";

const master = fc.string({ minLength: WEBHOOK_MASTER_MIN_LENGTH, maxLength: 96 });
const id = fc.string({ minLength: 1, maxLength: 64 });
const runs = { numRuns: 100 };

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

describe("Property 14: Webhook secret derivation", () => {
  it("is deterministic and matches an independent crypto.subtle computation", async () => {
    await fc.assert(
      fc.asyncProperty(master, id, async (m, w) => {
        const a = await deriveWebhookSecret(m, w);
        const b = await deriveWebhookSecret(m, w);
        expect(a).toBe(b);
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", enc.encode(m), { name: "HMAC", hash: "SHA-256" }, false, [
          "sign",
        ]);
        const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("aerobrief.webhook.v1." + w)));
        expect(Array.from(base64urlToBytes(a.slice(WEBHOOK_SECRET_PREFIX.length)))).toEqual(Array.from(mac));
      }),
      runs,
    );
  });

  it("has whsec_ prefix, unpadded base64url body of 43 chars decoding to 32 bytes", async () => {
    await fc.assert(
      fc.asyncProperty(master, id, async (m, w) => {
        const s = await deriveWebhookSecret(m, w);
        expect(s.startsWith("whsec_")).toBe(true);
        const body = s.slice(WEBHOOK_SECRET_PREFIX.length);
        expect(body).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(base64urlToBytes(body).length).toBe(32);
      }),
      runs,
    );
  });

  it("gives distinct secrets for distinct ids and for distinct masters", async () => {
    await fc.assert(
      fc.asyncProperty(master, master, id, id, async (m1, m2, w1, w2) => {
        fc.pre(w1 !== w2);
        expect(await deriveWebhookSecret(m1, w1)).not.toBe(await deriveWebhookSecret(m1, w2));
        fc.pre(m1 !== m2);
        expect(await deriveWebhookSecret(m1, w1)).not.toBe(await deriveWebhookSecret(m2, w1));
      }),
      runs,
    );
  });

  it("rejects short masters with a message containing no fragment of the master", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 4, maxLength: WEBHOOK_MASTER_MIN_LENGTH - 1 }),
        id,
        async (m, w) => {
          let message = "";
          try {
            await deriveWebhookSecret(m, w);
          } catch (e) {
            message = (e as Error).message;
          }
          expect(message).not.toBe("");
          // No 4-char fragment of the master appears in the message.
          for (let i = 0; i + 4 <= m.length; i++) {
            expect(message.includes(m.slice(i, i + 4))).toBe(false);
          }
        },
      ),
      runs,
    );
  });

  it("accepts a master of exactly the minimum length and rejects one shorter", async () => {
    await expect(deriveWebhookSecret("a".repeat(WEBHOOK_MASTER_MIN_LENGTH), "x")).resolves.toMatch(/^whsec_/);
    await expect(deriveWebhookSecret("a".repeat(WEBHOOK_MASTER_MIN_LENGTH - 1), "x")).rejects.toThrow();
  });
});
