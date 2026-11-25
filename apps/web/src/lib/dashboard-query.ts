/**
 * Dashboard filter and search state in the URL query string (Requirement 11.7).
 * The `#section` hash is not touched here; see `status-sections.ts`.
 * Pure: takes and returns strings and plain objects.
 */

export type AirportScope = "all" | "affected";
export type EventStateFilter = "active" | "ended";

export interface DashboardQueryState {
  /** Airports pane: all airports or only the affected ones. */
  airportScope: AirportScope;
  /** Airports pane search text. Empty string means no search. */
  search: string;
  /** Events pane filters. `null` means "all". A non-null id or type is non-empty. */
  eventAirportId: string | null;
  eventType: string | null;
  eventState: EventStateFilter | null;
}

export const DEFAULT_DASHBOARD_QUERY: DashboardQueryState = {
  airportScope: "all",
  search: "",
  eventAirportId: null,
  eventType: null,
  eventState: null,
};

const KEYS = {
  airportScope: "show",
  search: "q",
  eventAirportId: "airport",
  eventType: "type",
  eventState: "state",
} as const;

/** Query string without the leading "?"; default values are omitted, so the default state gives "". */
export function encodeDashboardQuery(state: DashboardQueryState): string {
  const params = new URLSearchParams();
  if (state.airportScope === "affected") params.set(KEYS.airportScope, "affected");
  if (state.search !== "") params.set(KEYS.search, state.search);
  if (state.eventAirportId !== null && state.eventAirportId !== "") {
    params.set(KEYS.eventAirportId, state.eventAirportId);
  }
  if (state.eventType !== null && state.eventType !== "") params.set(KEYS.eventType, state.eventType);
  if (state.eventState !== null) params.set(KEYS.eventState, state.eventState);
  return params.toString();
}

/**
 * Accepts `window.location.search`, with or without the leading "?". Unknown params are ignored
 * and malformed or unrecognised values fall back to the default for that field.
 */
export function decodeDashboardQuery(search: string): DashboardQueryState {
  const params = new URLSearchParams(search);
  const nonEmpty = (key: string): string | null => {
    const value = params.get(key);
    return value === null || value === "" ? null : value;
  };
  const stateValue = params.get(KEYS.eventState);
  return {
    airportScope: params.get(KEYS.airportScope) === "affected" ? "affected" : "all",
    search: params.get(KEYS.search) ?? "",
    eventAirportId: nonEmpty(KEYS.eventAirportId),
    eventType: nonEmpty(KEYS.eventType),
    eventState: stateValue === "active" || stateValue === "ended" ? stateValue : null,
  };
}
