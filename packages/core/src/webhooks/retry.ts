export type AttemptResult =
  | { status: number }
  | { errorKind: "timeout" | "network" | "blocked_url" | "invalid_payload" };

export type AttemptClassification = "delivered" | "retryable" | "permanent";

export type DeliveryOutcome = "delivered" | "failed";

export type NextStep = { done: true; outcome: DeliveryOutcome } | { done: false; waitMs: number };

export const MAX_ATTEMPTS = 3;
/** Wait after attempt 1 and after attempt 2. */
export const RETRY_WAITS_MS: readonly [number, number] = [2000, 8000];

export function classifyAttempt(result: AttemptResult): AttemptClassification {
  if ("errorKind" in result) {
    return result.errorKind === "timeout" || result.errorKind === "network"
      ? "retryable"
      : "permanent";
  }
  const { status } = result;
  if (status >= 200 && status <= 299) return "delivered";
  if (status === 408 || status === 429 || status >= 500) return "retryable";
  return "permanent";
}

export function nextStep(attemptsMade: number, classification: AttemptClassification): NextStep {
  if (classification === "delivered") return { done: true, outcome: "delivered" };
  if (classification === "permanent" || attemptsMade >= MAX_ATTEMPTS) {
    return { done: true, outcome: "failed" };
  }
  return { done: false, waitMs: attemptsMade <= 1 ? RETRY_WAITS_MS[0] : RETRY_WAITS_MS[1] };
}
