import { AIRPORTS, isMonitoredId, type MonitoredId } from "@aerobrief/core/airports";
import type { AirportStatusKind } from "@aerobrief/core/status-derivation";
import type { EventSummary, NationalStatusResponse } from "../api/client";
import { buildNetworkOverview } from "./network-overview";

export interface WatchedAirportView {
  airportId: MonitoredId;
  name: string;
  kind: AirportStatusKind;
  /** One plain-language line for affected airports, or null for Normal. */
  explanation: string | null;
}

/** One line per status kind, in plain language with no FAA codes. Normal has none. */
export function explainStatus(kind: AirportStatusKind, sinceText?: string): string | null {
  switch (kind) {
    case "normal":
      return null;
    case "ground_stop":
      return "A ground stop is in effect, so flights bound for this airport are held at their departure airports.";
    case "recovering":
      return `${sinceText !== undefined ? `${sinceText}. ` : ""}Flights are resuming and delays may continue.`;
    case "minor_impact":
      return "Minor delays are possible at this airport.";
    case "disrupted":
      return "Operations are disrupted at this airport.";
    case "data_unavailable":
      return "AeroBrief has no current status for this airport.";
  }
}

/**
 * Status and one-line explanation for each airport id. When the status response is not "ok"
 * every airport reads "Data Unavailable" rather than a guess.
 */
export function buildWatchedViews(
  ids: readonly string[],
  status: NationalStatusResponse | null,
  events: readonly EventSummary[],
  now: Date,
): WatchedAirportView[] {
  const ok = status !== null && status.state === "ok" ? status : null;
  const overview =
    ok === null
      ? null
      : buildNetworkOverview({ airports: ok.airports, events, stale: ok.stale, hasData: true, now });
  const affected = new Map(overview?.affected.map((a) => [a.airportId, a]) ?? []);
  const names = new Map(ok?.airports.map((a) => [a.airportId, a.name]) ?? []);
  const views: WatchedAirportView[] = [];
  for (const id of ids) {
    if (!isMonitoredId(id)) continue;
    const registry = AIRPORTS.find((a) => a.id === id);
    const name = names.get(id) ?? registry?.name ?? id;
    const entry = affected.get(id);
    const kind: AirportStatusKind = ok === null ? "data_unavailable" : (entry?.kind ?? "normal");
    views.push({ airportId: id, name, kind, explanation: explainStatus(kind, entry?.sinceText) });
  }
  return views;
}
