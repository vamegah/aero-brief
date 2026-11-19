import { describe, expect, it } from "vitest";
import {
  WEBHOOK_FAILURE_THRESHOLD,
  applyOutcome,
  type WebhookCounterState,
} from "../src/webhooks/counter";

const fresh: WebhookCounterState = { failures: 0, disabled: false };

describe("applyOutcome", () => {
  it("uses a threshold of 5", () => {
    expect(WEBHOOK_FAILURE_THRESHOLD).toBe(5);
  });

  it("adds 1 on failed and disables at the 5th consecutive failure", () => {
    let s = fresh;
    for (let i = 1; i <= 4; i++) {
      s = applyOutcome(s, "failed");
      expect(s).toEqual({ failures: i, disabled: false });
    }
    expect(applyOutcome(s, "failed")).toEqual({ failures: 5, disabled: true });
  });

  it("resets to 0 on delivered", () => {
    expect(applyOutcome({ failures: 4, disabled: false }, "delivered")).toEqual(fresh);
  });

  it("leaves state unchanged on skipped", () => {
    const s = { failures: 3, disabled: false };
    expect(applyOutcome(s, "skipped")).toEqual(s);
  });

  it("reenabled clears state and is idempotent", () => {
    const once = applyOutcome({ failures: 5, disabled: true }, "reenabled");
    expect(once).toEqual(fresh);
    expect(applyOutcome(once, "reenabled")).toEqual(once);
  });

  it("a disabled webhook ignores failed, delivered and skipped", () => {
    const s = { failures: 5, disabled: true };
    for (const e of ["failed", "delivered", "skipped"] as const) {
      expect(applyOutcome(s, e)).toEqual(s);
    }
  });

  it("does not mutate its input", () => {
    const s = Object.freeze({ failures: 2, disabled: false });
    expect(() => applyOutcome(s, "failed")).not.toThrow();
  });
});
