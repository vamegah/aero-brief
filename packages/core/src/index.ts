// Public API of @aerobrief/core. Re-exports only; no side effects.

export * from "./airports";
export * from "./schemas";
export * from "./dedupe";
export * from "./event-keys";
export * from "./time";
export * from "./logger";
export * from "./explain";
export * from "./unsubscribe";
export * from "./alert-email";
export * from "./account";
export * from "./watchlist";

// change-detector.ts re-exports Snapshot types that schemas.ts already exports,
// so list its own names explicitly.
export { NATIONWIDE_THRESHOLD, affectedArtccs, nationwideFromCenters, nationwideStatus, detectChanges } from "./change-detector";
export type { GroundStopEvent, NationwideEvent, DetectedEvent, NationwideStatus } from "./change-detector";

// normalize.ts re-exports deriveFaaEventId from dedupe.ts (exported above via `export *`).
export { normalizeResponse } from "./normalize";
