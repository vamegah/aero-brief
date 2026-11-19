import { describe, expect, it } from "vitest";
import { classifyAttempt, nextStep } from "../src/webhooks/retry";

describe("classifyAttempt", () => {
  it.each([200, 201, 204, 299])("%i is delivered", (status) => {
    expect(classifyAttempt({ status })).toBe("delivered");
  });
  it.each([408, 429, 500, 502, 503, 599])("%i is retryable", (status) => {
    expect(classifyAttempt({ status })).toBe("retryable");
  });
  it.each([100, 199, 300, 301, 302, 307, 400, 401, 403, 404, 410, 422])(
    "%i is permanent",
    (status) => {
      expect(classifyAttempt({ status })).toBe("permanent");
    },
  );
  it("classifies error kinds", () => {
    expect(classifyAttempt({ errorKind: "timeout" })).toBe("retryable");
    expect(classifyAttempt({ errorKind: "network" })).toBe("retryable");
    expect(classifyAttempt({ errorKind: "blocked_url" })).toBe("permanent");
    expect(classifyAttempt({ errorKind: "invalid_payload" })).toBe("permanent");
  });
});

describe("nextStep", () => {
  it("finishes delivered on success at any attempt", () => {
    for (const n of [1, 2, 3]) {
      expect(nextStep(n, "delivered")).toEqual({ done: true, outcome: "delivered" });
    }
  });
  it("fails at once on permanent", () => {
    expect(nextStep(1, "permanent")).toEqual({ done: true, outcome: "failed" });
  });
  it("waits 2000 ms then 8000 ms on retryable", () => {
    expect(nextStep(1, "retryable")).toEqual({ done: false, waitMs: 2000 });
    expect(nextStep(2, "retryable")).toEqual({ done: false, waitMs: 8000 });
  });
  it("stops after 3 attempts", () => {
    expect(nextStep(3, "retryable")).toEqual({ done: true, outcome: "failed" });
  });
});
