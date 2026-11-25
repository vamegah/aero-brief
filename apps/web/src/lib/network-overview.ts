import {
  summarizeNetwork,
  type AirportStatusKind,
  type DerivedAirportStatus,
  type NetworkSummary,
} from "@aerobrief/core/status-derivation";
import { airportStatusById } from "./airport-status-by-id";

export interface OverviewAirport {
  airportId: string;
  name: string;
  groundStop: unknown;
}

export interface OverviewEvent {
  type: string;
  airportId: string | null;
  occurredAt: string;
}

export interface AffectedAirportView {
  airportId: string;
  name: string;
  kind: AirportStatusKind;
  /** Only for "recovering": "Ended 2 h 5 min ago". */
  sinceText?: string;
  /** Only for "recovering": "AeroBrief estimate: ..." with its basis. */
  estimateText?: string;
}

export interface NetworkOverview {
  total: number;
  summary: NetworkSummary;
  affected: readonly AffectedAirportView[];
  /** True when the data is stale: every status is the last known one. */
  outdated: boolean;
  /** The "All N airports operating normally" headline applies only when this is true. */
  showAllNormal: boolean;
  headline: string;
  /** ISO time of the newest stored event, or null. */
  latestEventAt: string | null;
}

export const ESTIMATE_BASIS = "based on how long the ground stop lasted; not an FAA figure";

/** "Ended 2 h 5 min ago", "Ended 12 min ago", "Ended less than 1 min ago". */
export function formatSinceEnd(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return "Ended less than 1 min ago";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `Ended ${minutes} min ago`;
  if (minutes === 0) return `Ended ${hours} h ago`;
  return `Ended ${hours} h ${minutes} min ago`;
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "AeroBrief estimate: back to normal in about 30 min to 1 h 30 min (basis)". */
export function formatEstimate(range: readonly [number, number]): string {
  return `AeroBrief estimate: back to normal in about ${formatMinutes(range[0])} to ${formatMinutes(range[1])} (${ESTIMATE_BASIS})`;
}

function latestEventTime(events: readonly OverviewEvent[]): string | null {
  let best: { ms: number; iso: string } | null = null;
  for (const e of events) {
    const ms = Date.parse(e.occurredAt);
    if (!Number.isNaN(ms) && (best === null || ms > best.ms)) best = { ms, iso: e.occurredAt };
  }
  return best === null ? null : best.iso;
}

/**
 * Derives each airport's status from the snapshot plus the last-24h events, then summarizes the
 * network (Requirements 1.3 to 1.6). `hasData` false marks every airport Data Unavailable.
 * Stale data never produces the "operating normally" headline.
 */
export function buildNetworkOverview(input: {
  airports: readonly OverviewAirport[];
  events: readonly OverviewEvent[];
  stale: boolean;
  hasData: boolean;
  now: Date;
}): NetworkOverview {
  const { airports, events, stale, hasData, now } = input;
  const names = new Map(airports.map((a) => [a.airportId, a.name]));
  const byId = airportStatusById({ airports, events, hasData, now });
  const statuses: DerivedAirportStatus[] = [...byId.values()];
  const summary = summarizeNetwork(statuses);
  const affected: AffectedAirportView[] = summary.affected.map(({ airportId, kind }) => {
    const derived = byId.get(airportId);
    const view: AffectedAirportView = { airportId, name: names.get(airportId) ?? airportId, kind };
    if (kind === "recovering" && derived?.recoveringSinceMs !== undefined) {
      view.sinceText = formatSinceEnd(derived.recoveringSinceMs);
      if (derived.normalizationEstimateMinutes !== undefined) {
        view.estimateText = formatEstimate(derived.normalizationEstimateMinutes);
      }
    }
    return view;
  });

  const total = statuses.length;
  const outdated = hasData && stale;
  const showAllNormal = hasData && !stale && summary.allNormal;
  let headline: string;
  if (!hasData) headline = `Data Unavailable for all ${total} airports`;
  else if (outdated) headline = `Status is outdated. Showing the last known status of ${total} airports`;
  else if (summary.allNormal) headline = `All ${total} airports operating normally`;
  else headline = `${summary.affected.length} of ${total} airports affected`;

  return { total, summary, affected, outdated, showAllNormal, headline, latestEventAt: latestEventTime(events) };
}
