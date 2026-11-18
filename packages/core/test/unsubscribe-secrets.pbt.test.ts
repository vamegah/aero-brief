import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { signUnsubscribe, verifyUnsubscribe } from "../src/unsubscribe";

// Ids contain no "." because the signed message is `${userId}.${airportId}`.
const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/);
const secretArb = fc.string({ minLength: 1, maxLength: 40 });

describe("unsubscribe secret acceptance", () => {
  // Feature: aerobrief, Property 37: Unsubscribe secret acceptance
  // **Validates: Requirements 16.7, 16.8, 9.8**
  test("a link signed with a secret outside the accepted list is rejected; any listed secret is accepted", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        fc.array(secretArb, { maxLength: 3 }),
        idArb,
        idArb,
        async (signer, accepted, userId, airportId) => {
          const sig = await signUnsubscribe(signer, userId, airportId);
          const expected = accepted.includes(signer);
          expect(await verifyUnsubscribe(accepted, userId, airportId, sig)).toBe(expected);
          expect(await verifyUnsubscribe([...accepted, signer], userId, airportId, sig)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
