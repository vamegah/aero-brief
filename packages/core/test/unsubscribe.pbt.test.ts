import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { signUnsubscribe, verifyUnsubscribe } from "../src/unsubscribe";

// Ids contain no "." because the signed message is `${userId}.${airportId}`.
const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{1,24}$/);
const secretArb = fc.stringMatching(/^[ -~]{1,40}$/);

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

describe("Feature: aerobrief, Property 26: Unsubscribe signature", () => {
  /** **Validates: Requirements 9.8** */
  test("a signature verifies for its own (user, airport) pair", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, idArb, idArb, async (secret, userId, airportId) => {
        const sig = await signUnsubscribe(secret, userId, airportId);
        expect(await verifyUnsubscribe(secret, userId, airportId, sig)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 9.8** */
  test("verification fails for a different user id or airport id", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        fc.tuple(idArb, idArb),
        fc.tuple(idArb, idArb),
        async (secret, [userId, airportId], [otherUser, otherAirport]) => {
          fc.pre(userId !== otherUser || airportId !== otherAirport);
          const sig = await signUnsubscribe(secret, userId, airportId);
          expect(await verifyUnsubscribe(secret, otherUser, otherAirport, sig)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 9.8** */
  test("verification fails for an altered signature", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        idArb,
        idArb,
        fc.nat(41),
        fc.nat(63),
        async (secret, userId, airportId, pos, shift) => {
          const sig = await signUnsubscribe(secret, userId, airportId);
          // Change a character before the final one (the final char carries unused padding bits).
          const orig = B64URL.indexOf(sig[pos]!);
          const replacement = B64URL[(orig + 1 + (shift % 63)) % 64]!;
          const altered = sig.slice(0, pos) + replacement + sig.slice(pos + 1);
          expect(altered).not.toBe(sig);
          expect(await verifyUnsubscribe(secret, userId, airportId, altered)).toBe(false);
          // Truncation and a wrong secret also fail.
          expect(await verifyUnsubscribe(secret, userId, airportId, sig.slice(0, -2))).toBe(false);
          expect(await verifyUnsubscribe(secret + "x", userId, airportId, sig)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
