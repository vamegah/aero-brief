import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS } from "../src/airports";
import { signDigestUnsubscribe, verifyDigestUnsubscribe } from "../src/digest/unsubscribe";
import { signUnsubscribe, verifyUnsubscribe } from "../src/unsubscribe";

const userIdArb = fc.uuid();
const secretArb = fc.stringMatching(/^[ -~]{1,40}$/);
const airportArb = fc.constantFrom(...MONITORED_IDS);
const NUM_RUNS = 100;

// Feature: aerobrief-phase2, Property 10: Digest unsubscribe signature round trip and separation
describe("Feature: aerobrief-phase2, Property 10: Digest unsubscribe signature round trip and separation", () => {
  /** **Validates: Requirements 12.1, 12.2, 12.8** */
  test("a digest signature verifies for its own user and secret", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, secretArb, async (userId, secret) => {
        const sig = await signDigestUnsubscribe(userId, secret);
        expect(await verifyDigestUnsubscribe(userId, sig, [secret])).toBe(true);
        expect(await verifyDigestUnsubscribe(userId, sig, secret)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 12.1, 12.2, 12.8** */
  test("a different user or a different secret does not verify", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, secretArb, secretArb, async (userId, other, secret, otherSecret) => {
        fc.pre(userId !== other && secret !== otherSecret);
        const sig = await signDigestUnsubscribe(userId, secret);
        expect(await verifyDigestUnsubscribe(other, sig, [secret])).toBe(false);
        expect(await verifyDigestUnsubscribe(userId, sig, [otherSecret])).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 12.1, 12.2, 12.8** */
  test("a secret list containing the signing secret verifies", async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        secretArb,
        fc.array(secretArb, { maxLength: 3 }),
        fc.array(secretArb, { maxLength: 3 }),
        async (userId, secret, before, after) => {
          const sig = await signDigestUnsubscribe(userId, secret);
          expect(await verifyDigestUnsubscribe(userId, sig, [...before, secret, ...after])).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 12.1, 12.2, 12.8** */
  test("a changed signature does not verify", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, secretArb, fc.nat(42), async (userId, secret, pos) => {
        const sig = await signDigestUnsubscribe(userId, secret);
        const i = pos % sig.length;
        const swapped = sig[i] === "A" ? "B" : "A";
        const tampered = sig.slice(0, i) + swapped + sig.slice(i + 1);
        expect(await verifyDigestUnsubscribe(userId, tampered, [secret])).toBe(false);
        expect(await verifyDigestUnsubscribe(userId, sig.slice(0, -1), [secret])).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 12.1, 12.2, 12.8** */
  test("a digest signature never verifies under verifyUnsubscribe, and the reverse", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, airportArb, secretArb, async (userId, airportId, secret) => {
        const digestSig = await signDigestUnsubscribe(userId, secret);
        expect(await verifyUnsubscribe(secret, userId, airportId, digestSig)).toBe(false);
        expect(await verifyUnsubscribe([secret], userId, airportId, digestSig)).toBe(false);

        const airportSig = await signUnsubscribe(secret, userId, airportId);
        expect(await verifyDigestUnsubscribe(userId, airportSig, [secret])).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
