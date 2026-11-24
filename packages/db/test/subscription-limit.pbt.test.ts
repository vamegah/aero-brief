import * as fc from "fast-check";
import { describe, it } from "vitest";
import { isSubscriptionLimitError } from "../src/repositories";

/** Wraps `inner` in `depth` levels of `cause`; the result is at nesting depth `depth` + 1. */
const wrap = (inner: unknown, depth: number): unknown => {
  let current = inner;
  for (let i = 0; i < depth; i++) current = { message: "Failed query", cause: current };
  return current;
};

describe("Property 2: Cap_Error recognition", () => {
  // **Validates: Requirements 3.4, 3.5**
  it("recognizes code 23514 with 'subscription limit' for any number and depth up to 5", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 4 }), (n, depth) => {
        const leaf = { code: "23514", message: `subscription limit of ${n} reached` };
        return isSubscriptionLimitError(wrap(leaf, depth));
      }),
    );
  });

  it("returns false for a wrong code or a message without 'subscription limit'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 4 }),
        fc.string().filter((s) => /^\d{5}$/.test(s) === false || s !== "23514"),
        fc.string().filter((s) => !s.includes("subscription limit")),
        (n, depth, badCode, badText) => {
          const wrongCode = { code: badCode, message: `subscription limit of ${n} reached` };
          const wrongText = { code: "23514", message: badText };
          return !isSubscriptionLimitError(wrap(wrongCode, depth)) && !isSubscriptionLimitError(wrap(wrongText, depth));
        },
      ),
    );
  });
});
