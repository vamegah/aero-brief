import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BACKOFF_MS, MAX_ATTEMPTS, sendEmail, type FetchFn } from "../src/send-email";

// Feature: aerobrief, Property 25: Retry bound and final outcome
// **Validates: Requirements 9.5**

type FailureKind = "503" | "500" | "429" | "409" | "network" | "timeout";

function failure(kind: FailureKind): Response {
  if (kind === "network") throw new TypeError("fetch failed");
  if (kind === "timeout") throw new DOMException("timed out", "TimeoutError");
  return new Response("{}", { status: Number(kind) });
}

describe("Property 25: Retry bound and final outcome", () => {
  it("makes min(k + 1, 3) attempts and ends handed off iff k < 3", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 8 }),
        fc.array(fc.constantFrom<FailureKind>("503", "500", "429", "409", "network", "timeout"), {
          minLength: 8,
          maxLength: 8,
        }),
        async (k, kinds) => {
          let calls = 0;
          const sleeps: number[] = [];
          const fetchFake: FetchFn = async () => {
            const n = calls++;
            if (n < k) return failure(kinds[n]!);
            return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
          };
          const result = await sendEmail({
            apiKey: "re_test",
            message: { from: "a@x.com", to: "b@x.com", subject: "s", text: "t" },
            idempotency: { eventKey: "e", eventType: "GROUND_STOP_STARTED", userId: "u" },
            fetch: fetchFake,
            sleep: async (ms) => void sleeps.push(ms),
          });

          const expectedAttempts = Math.min(k + 1, MAX_ATTEMPTS);
          expect(calls).toBe(expectedAttempts);
          expect(result.attempts).toBe(expectedAttempts);
          expect(result.ok).toBe(k < MAX_ATTEMPTS);
          expect(sleeps).toEqual(BACKOFF_MS.slice(0, expectedAttempts - 1));
        },
      ),
      { numRuns: 100 },
    );
  });
});
