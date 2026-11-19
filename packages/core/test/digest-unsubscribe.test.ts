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

  it("never cross-verifies with the per-airport signature", async () => {
    const digest = await signDigestUnsubscribe(USER, "s1");
    const airport = await signUnsubscribe("s1", USER, "KJFK");
    expect(await verifyUnsubscribe(["s1"], USER, "KJFK", digest)).toBe(false);
    expect(await verifyDigestUnsubscribe(USER, airport, ["s1"])).toBe(false);
  });
});
