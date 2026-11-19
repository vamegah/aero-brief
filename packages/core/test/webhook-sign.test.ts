import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook } from "../src/webhooks/sign";

const secret = "whsec_test-secret";
const body = '{"hello":"world"}';
const ts = 1_800_000_000;

describe("signWebhook", () => {
  it("returns v1= plus 64 lowercase hex characters, deterministically", async () => {
    const sig = await signWebhook(secret, ts, body);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(await signWebhook(secret, ts, body)).toBe(sig);
  });

  it("signs over `<timestamp>.<body>` with the full secret string as key", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`)));
    const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await signWebhook(secret, ts, body)).toBe(`v1=${hex}`);
  });
});

describe("verifyWebhook", () => {
  it("accepts a fresh valid signature", async () => {
    const signatureHeader = await signWebhook(secret, ts, body);
    expect(await verifyWebhook({ secret, timestamp: ts, body, signatureHeader, nowSeconds: ts })).toBe(true);
  });

  it("accepts at exactly 300 seconds and rejects at 301, both directions", async () => {
    const signatureHeader = await signWebhook(secret, ts, body);
    const base = { secret, timestamp: ts, body, signatureHeader };
    expect(await verifyWebhook({ ...base, nowSeconds: ts + 300 })).toBe(true);
    expect(await verifyWebhook({ ...base, nowSeconds: ts - 300 })).toBe(true);
    expect(await verifyWebhook({ ...base, nowSeconds: ts + 301 })).toBe(false);
    expect(await verifyWebhook({ ...base, nowSeconds: ts - 301 })).toBe(false);
  });

  it("rejects a changed body, timestamp, secret or signature", async () => {
    const signatureHeader = await signWebhook(secret, ts, body);
    const base = { secret, timestamp: ts, body, signatureHeader, nowSeconds: ts };
    expect(await verifyWebhook({ ...base, body: body + " " })).toBe(false);
    expect(await verifyWebhook({ ...base, timestamp: ts + 1 })).toBe(false);
    expect(await verifyWebhook({ ...base, secret: "whsec_other" })).toBe(false);
    const flipped = signatureHeader.slice(0, -1) + (signatureHeader.endsWith("0") ? "1" : "0");
    expect(await verifyWebhook({ ...base, signatureHeader: flipped })).toBe(false);
  });

  it("rejects malformed headers", async () => {
    const good = await signWebhook(secret, ts, body);
    const base = { secret, timestamp: ts, body, nowSeconds: ts };
    for (const signatureHeader of [
      "",
      good.slice(3),
      good.toUpperCase(),
      "v2=" + good.slice(3),
      good + "0",
      good.slice(0, -1),
      "v1=" + "g".repeat(64),
    ]) {
      expect(await verifyWebhook({ ...base, signatureHeader })).toBe(false);
    }
  });
});
