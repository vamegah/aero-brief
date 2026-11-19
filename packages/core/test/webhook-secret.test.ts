import { describe, expect, it } from "vitest";
import { deriveWebhookSecret } from "../src/webhooks/secret";

const MASTER = "m".repeat(16) + "0123456789abcdef";

describe("deriveWebhookSecret", () => {
  it("matches an independently computed HMAC-SHA256 (known answer)", async () => {
    const id = "6f1c2a40-0000-4000-8000-000000000001";
    // Vector computed once with node:crypto (core has no node types):
    // createHmac("sha256", MASTER).update("aerobrief.webhook.v1." + id).digest("base64url")
    const expected = "0qPhW14PYZg9Bbtd5S7eHJIheGr_u03jVvejlJICUEk";
    const got = await deriveWebhookSecret(MASTER, id);
    expect(got).toBe("whsec_" + expected);
    expect(got).toHaveLength(6 + 43);
    expect(got).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
  });

  it("is deterministic", async () => {
    expect(await deriveWebhookSecret(MASTER, "a")).toBe(await deriveWebhookSecret(MASTER, "a"));
  });

  it("gives different secrets for different ids and different masters", async () => {
    expect(await deriveWebhookSecret(MASTER, "a")).not.toBe(await deriveWebhookSecret(MASTER, "b"));
    expect(await deriveWebhookSecret(MASTER, "a")).not.toBe(await deriveWebhookSecret(MASTER + "x", "a"));
  });

  it("rejects a master shorter than 32 characters without leaking it", async () => {
    const short = "SHORTSECRET-abc123";
    await expect(deriveWebhookSecret(short, "a")).rejects.toThrow();
    const err = (await deriveWebhookSecret(short, "a").catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain(short);
    expect(err.message).not.toContain("SHORT");
    expect(err.message).not.toContain("abc123");
    await expect(deriveWebhookSecret("x".repeat(31), "a")).rejects.toThrow();
    await expect(deriveWebhookSecret("x".repeat(32), "a")).resolves.toMatch(/^whsec_/);
  });
});
