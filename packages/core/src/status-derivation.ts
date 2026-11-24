import type { MonitoredId } from "./airports";

export type AirportStatusKind =
  | "normal"
  | "minor_impact"
  | "disrupted"
  | "ground_stop"
  | "recovering"
  | "data_unavailable";

/** All six kinds, in display severity order (most severe first, Normal last). */
export const AIRPORT_STATUS_KINDS: readonly AirportStatusKind[] = [
  "ground_stop",
  "disrupted",
  "minor_impact",
  "recovering",
  "data_unavailable",
  "normal",
];

/** Default Recovery_Period: how long an airport reads "Recovering" after a ground stop ends. */
export const RECOVERY_PERIOD_MS = 24 * 60 * 60 * 1000;

/** Smallest width of the Normalization_Estimate range, in minutes. */
export const MIN_ESTIMATE_WINDOW_MINUTES = 15;

export interface StatusCatalogEntry {
  /** Icon identifier: check, info-circle, warning-triangle, stop-octagon, clock-arrow, question-mark. */
  icon: "check" | "info-circle" | "warning-triangle" | "stop-octagon" | "clock-arrow" | "question-mark";
  /** Semantic color token name (see apps/web/src/styles/tokens.css). */
  color: "color-success" | "color-accent" | "color-warning" | "color-danger" | "color-text-muted";
  /** Plain-language text label; the text alone conveys the status. */
  label: string;
  /** False for kinds that deriveAirportStatus never returns yet (event-type pipeline is deferred). */
  derived: boolean;
}

/**
 * One icon, color and label per Airport_Status. `minor_impact` and `disrupted` are defined
 * and styled but not yet derived: delay programs and closures are not tracked.
 */
export const STATUS_CATALOG: Readonly<Record<AirportStatusKind, StatusCatalogEntry>> = {
  normal: { icon: "check", color: "color-success", label: "Normal", derived: true },
  minor_impact: { icon: "info-circle", color: "color-accent", label: "Minor Impact", derived: false },
  disrupted: { icon: "warning-triangle", color: "color-warning", label: "Disrupted", derived: false },
  ground_stop: { icon: "stop-octagon", color: "color-danger", label: "Ground Stop", derived: true },
  recovering: { icon: "clock-arrow", color: "color-warning", label: "Recovering", derived: true },
  data_unavailable: { icon: "question-mark", color: "color-text-muted", label: "Data Unavailable", derived: true },
};

export interface DerivedAirportStatus {
  airportId: MonitoredId;
  kind: AirportStatusKind;
  /** Present only for "recovering": ms since the ground stop ended (never negative). */
  recoveringSinceMs?: number;
  /** Present only for "recovering": the Normalization_Estimate range in minutes. */
  normalizationEstimateMinutes?: readonly [number, number];
}

/**
 * One airport's status. Precedence: data_unavailable > ground_stop > recovering > normal.
 * Returns only those four kinds: `minor_impact` and `disrupted` are never derived until the
 * deferred event-type pipeline exists.
 *
 * `lastEndedAt` is the most recent GROUND_STOP_ENDED time (ISO) among retained events, or null.
 * The Recovery_Period runs from that time; an unparseable value counts as no ended stop.
 * The estimate in a recovering result is based on the ground stop's duration when `lastStartedAt`
 * is given, otherwise on the minimum window.
 */
export function deriveAirportStatus(input: {
  airportId: MonitoredId;
  hasData: boolean;
  activeGroundStop: boolean;
  lastEndedAt: string | null;
  /** Start time (ISO) of the ground stop that ended at `lastEndedAt`, when known. */
  lastStartedAt?: string | null;
  now: Date;
}): DerivedAirportStatus {
  const { airportId, hasData, activeGroundStop, lastEndedAt, now } = input;
  if (!hasData) return { airportId, kind: "data_unavailable" };
  if (activeGroundStop) return { airportId, kind: "ground_stop" };
  if (lastEndedAt !== null) {
    const endedMs = Date.parse(lastEndedAt);
    const ageMs = now.getTime() - endedMs;
    if (Number.isFinite(ageMs) && ageMs < RECOVERY_PERIOD_MS) {
      const startedMs = input.lastStartedAt ? Date.parse(input.lastStartedAt) : Number.NaN;
      const durationMs = endedMs - startedMs;
      return {
        airportId,
        kind: "recovering",
        recoveringSinceMs: Math.max(0, ageMs),
        normalizationEstimateMinutes: normalizationEstimate(Number.isFinite(durationMs) ? durationMs : 0),
      };
    }
  }
  return { airportId, kind: "normal" };
}

export interface NetworkSummary {
  counts: Readonly<Record<AirportStatusKind, number>>;
  /** Airports whose status is not "normal". */
  affected: readonly { airportId: MonitoredId; kind: AirportStatusKind }[];
  allNormal: boolean;
}

/** Aggregates per-airport statuses into counts and the affected list. */
export function summarizeNetwork(statuses: readonly DerivedAirportStatus[]): NetworkSummary {
  const counts: Record<AirportStatusKind, number> = {
    normal: 0,
    minor_impact: 0,
    disrupted: 0,
    ground_stop: 0,
    recovering: 0,
    data_unavailable: 0,
  };
  const affected: { airportId: MonitoredId; kind: AirportStatusKind }[] = [];
  for (const s of statuses) {
    counts[s.kind] += 1;
    if (s.kind !== "normal") affected.push({ airportId: s.airportId, kind: s.kind });
  }
  return { counts, affected, allNormal: affected.length === 0 };
}

/**
 * Normalization_Estimate in whole minutes: the ground stop duration x 0.5 to x 1.5, with the
 * range at least MIN_ESTIMATE_WINDOW_MINUTES wide. The UI labels it "AeroBrief estimate".
 * Negative or non-finite durations count as 0.
 */
export function normalizationEstimate(durationMs: number): readonly [number, number] {
  const minutes = Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 60_000 : 0;
  const low = Math.round(minutes * 0.5);
  const high = Math.max(Math.round(minutes * 1.5), low + MIN_ESTIMATE_WINDOW_MINUTES);
  return [low, high];
}
