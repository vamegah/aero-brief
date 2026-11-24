export const EVENT_TYPE_LABELS = {
  GROUND_STOP_STARTED: "Ground stop started",
  GROUND_STOP_ENDED: "Ground stop ended",
  NATIONWIDE_EVENT: "System-wide disruption",
} as const;

export type KnownEventType = keyof typeof EVENT_TYPE_LABELS;

/** Known event types in label-map insertion order. */
export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as KnownEventType[];
