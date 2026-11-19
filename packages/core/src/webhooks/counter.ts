/** Consecutive failures at which a webhook disables itself. Mirrored in SQL. */
export const WEBHOOK_FAILURE_THRESHOLD = 5;

export interface WebhookCounterState {
  failures: number;
  disabled: boolean;
}

export type WebhookOutcomeEvent = "delivered" | "failed" | "skipped" | "reenabled";

/**
 * Pure failure counter. `failed` adds 1 and disables at the threshold,
 * `delivered` resets to 0, `skipped` changes nothing, `reenabled` clears
 * both fields. A disabled webhook ignores every event except `reenabled`.
 */
export function applyOutcome(
  state: WebhookCounterState,
  event: WebhookOutcomeEvent,
): WebhookCounterState {
  if (event === "reenabled") return { failures: 0, disabled: false };
  if (state.disabled || event === "skipped") {
    return { failures: state.failures, disabled: state.disabled };
  }
  if (event === "delivered") return { failures: 0, disabled: false };
  const failures = state.failures + 1;
  return { failures, disabled: failures >= WEBHOOK_FAILURE_THRESHOLD };
}
