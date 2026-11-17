import { describe, expect, it } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "../src/unsubscribe";

describe("unsubscribe signature", () => {
  it("is base64url (no padding, +, /) and 43 chars for SHA-256", async () => {
    const sig = await signUnsubscribe("secret", "user-1", "KJFK");
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("matches a known HMAC-SHA256 value over userId.airportId", async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("s"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("u.KATL")));
    const expected = btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await signUnsubscribe("s", "u", "KATL")).toBe(expected);
  });

  it("verifies a valid signature", async () => {
    const sig = await signUnsubscribe("secret", "u1", "KJFK");
    expect(await verifyUnsubscribe("secret", "u1", "KJFK", sig)).toBe(true);
  });

  it("rejects wrong secret, user, airport, tampered, and malformed signatures", async () => {
    const sig = await signUnsubscribe("secret", "u1", "KJFK");
    expect(await verifyUnsubscribe("other", "u1", "KJFK", sig)).toBe(false);
    expect(await verifyUnsubscribe("secret", "u2", "KJFK", sig)).toBe(false);
    expect(await verifyUnsubscribe("secret", "u1", "KATL", sig)).toBe(false);
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(await verifyUnsubscribe("secret", "u1", "KJFK", flipped)).toBe(false);
    expect(await verifyUnsubscribe("secret", "u1", "KJFK", "")).toBe(false);
    expect(await verifyUnsubscribe("secret", "u1", "KJFK", "!!!not base64!!!")).toBe(false);
    expect(await verifyUnsubscribe("secret", "u1", "KJFK", sig.slice(0, 20))).toBe(false);
  });
});
