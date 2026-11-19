import { describe, it } from "vitest";
import fc from "fast-check";
import { signWebhook, verifyWebhook } from "../src/webhooks/sign";

// Secrets: arbitrary unicode strings, or the whsec_ form with a base64url-like tail.
const secretArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 64, unit: "grapheme" }),
  fc
    .string({ minLength: 1, maxLength: 48, unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-".split("")) })
    .map((tail) => `whsec_${tail}`),
);
const timestampArb = fc.integer({ min: 0, max: 4_102_444_800 });
const bodyArb = fc.oneof(
  fc.string({ maxLength: 200, unit: "grapheme" }),
  fc.string({ maxLength: 200, unit: "binary" }),
  fc.json(),
);
// Offset of "now" from the timestamp, within the 300 s window (inclusive).
const offsetArb = fc.integer({ min: -300, max: 300 });

describe("Property 15: Signature round trip", () => {
  // Feature: aerobrief-phase2, Property 15: Signature round trip
  // **Validates: Requirements 15.2, 15.5, 15.8**
  it("verify accepts sign output within 300 s and the header is v1= plus 64 lowercase hex", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, timestampArb, bodyArb, offsetArb, async (secret, timestamp, body, offset) => {
        const header = await signWebhook(secret, timestamp, body);
        if (!/^v1=[0-9a-f]{64}$/.test(header)) return false;
        return verifyWebhook({
          secret,
          timestamp,
          body,
          signatureHeader: header,
          nowSeconds: timestamp + offset,
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 16: Tamper and replay rejection", () => {
  // Feature: aerobrief-phase2, Property 16: Tamper and replay rejection
  // **Validates: Requirements 15.5, 15.9, 15.10**
  const hexChars = "0123456789abcdef".split("");

  it("rejects a body that differs by one character", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        timestampArb,
        bodyArb,
        fc.nat(),
        fc.constantFrom(..."abcXYZ019 .{}\"".split("")),
        async (secret, timestamp, body, pos, ch) => {
          const header = await signWebhook(secret, timestamp, body);
          let tampered: string;
          if (body.length === 0) {
            tampered = ch;
          } else {
            const i = pos % body.length;
            const replacement = body[i] === ch ? (ch === "a" ? "b" : "a") : ch;
            tampered = body.slice(0, i) + replacement + body.slice(i + 1);
          }
          const ok = await verifyWebhook({ secret, timestamp, body: tampered, signatureHeader: header, nowSeconds: timestamp });
          return ok === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects a different timestamp in the signed input", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, timestampArb, bodyArb, timestampArb, async (secret, timestamp, body, other) => {
        fc.pre(other !== timestamp);
        const header = await signWebhook(secret, timestamp, body);
        const ok = await verifyWebhook({ secret, timestamp: other, body, signatureHeader: header, nowSeconds: other });
        return ok === false;
      }),
      { numRuns: 100 },
    );
  });

  it("rejects a different secret", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, secretArb, timestampArb, bodyArb, async (secret, other, timestamp, body) => {
        fc.pre(other !== secret);
        const header = await signWebhook(secret, timestamp, body);
        const ok = await verifyWebhook({ secret: other, timestamp, body, signatureHeader: header, nowSeconds: timestamp });
        return ok === false;
      }),
      { numRuns: 100 },
    );
  });

  it("rejects a signature with one hex digit changed", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        timestampArb,
        bodyArb,
        fc.integer({ min: 0, max: 63 }),
        fc.constantFrom(...hexChars),
        async (secret, timestamp, body, pos, digit) => {
          const header = await signWebhook(secret, timestamp, body);
          const at = 3 + pos;
          const replacement = header[at] === digit ? hexChars[(hexChars.indexOf(digit) + 1) % 16]! : digit;
          const modified = header.slice(0, at) + replacement + header.slice(at + 1);
          const ok = await verifyWebhook({ secret, timestamp, body, signatureHeader: modified, nowSeconds: timestamp });
          return ok === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when now is 301 s or more away from the timestamp, in both directions", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        timestampArb,
        bodyArb,
        fc.oneof(fc.constant(301), fc.integer({ min: 301, max: 1_000_000 })),
        async (secret, timestamp, body, delta) => {
          const header = await signWebhook(secret, timestamp, body);
          const input = { secret, timestamp, body, signatureHeader: header };
          const late = await verifyWebhook({ ...input, nowSeconds: timestamp + delta });
          const early = await verifyWebhook({ ...input, nowSeconds: timestamp - delta });
          return late === false && early === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts exactly 300 s after and exactly 300 s before the timestamp", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, timestampArb, bodyArb, async (secret, timestamp, body) => {
        const header = await signWebhook(secret, timestamp, body);
        const input = { secret, timestamp, body, signatureHeader: header };
        const late = await verifyWebhook({ ...input, nowSeconds: timestamp + 300 });
        const early = await verifyWebhook({ ...input, nowSeconds: timestamp - 300 });
        return late === true && early === true;
      }),
      { numRuns: 100 },
    );
  });
});
