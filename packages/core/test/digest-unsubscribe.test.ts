import { describe, expect, it } from "vitest";
import { signDigestUnsubscribe, verifyDigestUnsubscribe } from "../src/digest/unsubscribe";
import { signUnsubscribe, verifyUnsubscribe } from "../src/unsubscribe";

const USER = "123e4567-e89b-12d3-a456-426614174000";

describe("digest unsubscribe signature", () => {
  it("round-trips with a single secret or a list", async () => {
    const sig = await signDigestUnsubscribe(USER, "s1");
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await verifyDigestUnsubscribe(USER, sig, "s1")).toBe(true);
    expect(await verifyDigestUnsubscribe(USER, sig, ["old", "s1"])).toBe(true);
  });

  it("rejects a changed user, signature or secret, and malformed input", async () => {
    const sig = await signDigestUnsubscribe(USER, "s1");
    expect(await verifyDigestUnsubscribe(USER + "x", sig, ["s1"])).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, sig, ["s2"])).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, sig, [])).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, "A" + sig.slice(1), ["s1"])).toBe(sig[0] === "A");
    expect(await verifyDigestUnsubscribe(USER, "!!!", ["s1"])).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, "", ["s1"])).toBe(false);
  });

  it("accepts only the canonical encoding (Property 10 counterexample)", async () => {
    const user = "00000000-5f10-6582-8000-001a41acf1c7";
    const secret = "( 60Q";
    const sig = await signDigestUnsubscribe(user, secret);
    expect(sig).toHaveLength(43);
    expect(await verifyDigestUnsubscribe(user, sig, [secret])).toBe(true);

    // The last character holds 2 data bits; every other last character must be rejected,
    // including those that decode to the same bytes.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (const c of alphabet) {
      const variant = sig.slice(0, -1) + c;
      expect(await verifyDigestUnsubscribe(user, variant, [secret])).toBe(c === sig.at(-1));
    }
    const swapped = sig.slice(0, -1) + (sig.at(-1) === "A" ? "B" : "A");
    expect(await verifyDigestUnsubscribe(user, swapped, [secret])).toBe(false);
  });

  it("rejects non-alphabet characters, wrong length, padding and whitespace", async () => {
    const sig = await signDigestUnsubscribe(USER, "s1");
    const bad = [
      sig + "=",
      sig + "==",
      sig.slice(0, -1),
      sig + "A",
      sig.slice(0, -2),
      ` ${sig}`,
      `${sig} `,
      `${sig}\n`,
      `${sig.slice(0, 10)} ${sig.slice(10)}`,
      sig.slice(0, 10) + "+" + sig.slice(11),
      sig.slice(0, 10) + "/" + sig.slice(11),
      sig.slice(0, 10) + "!" + sig.slice(11),
      sig.slice(0, 10) + "é" + sig.slice(11),
    ];
    for (const b of bad) expect(await verifyDigestUnsubscribe(USER, b, ["s1"])).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, sig, ["s1"])).toBe(true);
  });

  it("never cross-verifies with the per-airport signature", async () => {
    const digest = await signDigestUnsubscribe(USER, "s1");
    const airport = await signUnsubscribe("s1", USER, "KJFK");
    expect(await verifyUnsubscribe(["s1"], USER, "KJFK", digest)).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, airport, ["s1"])).toBe(false);
  });
});
