import { describe, expect, it } from "vitest";
import { acceptedUnsubscribeSecrets, signUnsubscribe, verifyUnsubscribe } from "../src/unsubscribe";

const NOW = new Date("2025-01-02T12:00:00Z");

describe("acceptedUnsubscribeSecrets", () => {
  it("returns only the current secret when no previous is set", () => {
    expect(acceptedUnsubscribeSecrets("cur", undefined, undefined, NOW)).toEqual(["cur"]);
  });

  it("includes the previous secret before expiry", () => {
    expect(acceptedUnsubscribeSecrets("cur", "old", "2025-01-02T12:00:01Z", NOW)).toEqual(["cur", "old"]);
  });

  it("excludes the previous secret at and after expiry", () => {
    expect(acceptedUnsubscribeSecrets("cur", "old", "2025-01-02T12:00:00Z", NOW)).toEqual(["cur"]);
    expect(acceptedUnsubscribeSecrets("cur", "old", "2025-01-01T00:00:00Z", NOW)).toEqual(["cur"]);
  });

  it("ignores the previous secret when the expiry is missing or malformed", () => {
    for (const bad of [undefined, "", "tomorrow", "2030-01-01", "2030-13-45T00:00:00Z", "1735776000"]) {
      expect(acceptedUnsubscribeSecrets("cur", "old", bad, NOW)).toEqual(["cur"]);
    }
  });
});

describe("verifyUnsubscribe with a secret list", () => {
  it("accepts a signature from any listed secret and rejects others", async () => {
    const sig = await signUnsubscribe("old", "u1", "KJFK");
    expect(await verifyUnsubscribe(["cur", "old"], "u1", "KJFK", sig)).toBe(true);
    expect(await verifyUnsubscribe(["cur"], "u1", "KJFK", sig)).toBe(false);
    expect(await verifyUnsubscribe([], "u1", "KJFK", sig)).toBe(false);
  });
});
