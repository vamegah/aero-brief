import { AIRPORTS, isMonitoredId } from "@aerobrief/core/airports";
import type { EventSummary, NationalStatusResponse } from "../api/client";
import { matchesAirportSearch } from "../lib/airport-search";
import { DEFAULT_DASHBOARD_QUERY, type AirportScope } from "../lib/dashboard-query";
import { EVENT_TYPES } from "../lib/event-types";
import type { EventFilter } from "../lib/filter-events";
import {
  buildIncidentFeed,
  feedSize,
  filterIncidentFeed,
  latestEndedKeys,
  limitFeed,
} from "../lib/incident-feed";
import { STATUS_SECTION_IDS, STATUS_SECTION_LABELS, resolveStatusSection } from "../lib/status-sections";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { useLocationHash } from "../hooks/use-location-hash";
import { buildNetworkOverview } from "../lib/network-overview";
import { sortAirports } from "../lib/sort-airports";
import { AirportTable } from "./AirportTable";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventFilters } from "./EventFilters";
import { Icon } from "./Icon";
import { IncidentList } from "./IncidentList";
import type { IncidentRecovery } from "./IncidentCard";
import { SectionMenu } from "./SectionMenu";
import { FormLabel } from "./FormLabel";
import { TextInput } from "./TextInput";
import { LoadingState } from "./LoadingState";
import { StaleDataBanner } from "./StaleDataBanner";
import { NetworkOverview } from "./NetworkOverview";
import { SystemWideBanner } from "./SystemWideBanner";

export interface StatusViewProps {
  status: NationalStatusResponse | null;
  events: readonly EventSummary[];
  loading: boolean;
  /** Current time; tests pass a fixed value. */
  now?: Date;
}

const LATEST_EVENT_COUNT = 5;

export function StatusView({ status, events, loading, now }: StatusViewProps) {
  const ok = status !== null && status.state === "ok" ? status : null;
  // Filter and search state lives in the URL query string (Requirement 11.7).
  const [dashQuery, setDashQuery] = useDashboardQuery();
  const affectedOnly = dashQuery.airportScope === "affected";
  const query = dashQuery.search;
  const sorted = ok === null ? [] : sortAirports(ok.airports);
  const affectedCount = sorted.filter((airport) => airport.groundStop !== null).length;
  const filtered = affectedOnly ? sorted.filter((airport) => airport.groundStop !== null) : sorted;
  const shown = filtered.filter((airport) => matchesAirportSearch(airport, query));
  const searching = query.trim() !== "";
  const active = resolveStatusSection(useLocationHash());
  // Values read from the URL are checked, so a stale or hand-edited link cannot hide every event.
  const eventFilter: EventFilter = {
    airportId:
      dashQuery.eventAirportId !== null && isMonitoredId(dashQuery.eventAirportId) ? dashQuery.eventAirportId : null,
    type:
      dashQuery.eventType !== null && (EVENT_TYPES as readonly string[]).includes(dashQuery.eventType)
        ? dashQuery.eventType
        : null,
    state: dashQuery.eventState,
  };
  const setEventFilter = (next: EventFilter): void =>
    setDashQuery((prev) => ({
      ...prev,
      eventAirportId: next.airportId,
      eventType: next.type,
      eventState: next.state ?? null,
    }));
  // A clear button disappears once it is used. Focus moves to the field it cleared, so a keyboard
  // user does not drop back to the top of the page.
  const focusById = (id: string): void => document.getElementById(id)?.focus();
  const clearEventFilters = (): void => {
    setDashQuery((prev) => ({
      ...prev,
      eventAirportId: DEFAULT_DASHBOARD_QUERY.eventAirportId,
      eventType: DEFAULT_DASHBOARD_QUERY.eventType,
      eventState: DEFAULT_DASHBOARD_QUERY.eventState,
    }));
    focusById("event-filter-airport");
  };
  const clearAirportFilters = (): void => {
    setDashQuery((prev) => ({
      ...prev,
      airportScope: DEFAULT_DASHBOARD_QUERY.airportScope,
      search: DEFAULT_DASHBOARD_QUERY.search,
    }));
    focusById("airport-search");
  };
  const setSearch = (search: string): void => setDashQuery((prev) => ({ ...prev, search }));
  const setScope = (airportScope: AirportScope): void => setDashQuery((prev) => ({ ...prev, airportScope }));
  const feed = buildIncidentFeed(events);
  const shownFeed = filterIncidentFeed(feed, eventFilter);
  const shownCount = feedSize(shownFeed);
  const totalCount = feedSize(feed);
  const latestFeed = limitFeed(feed, LATEST_EVENT_COUNT);
  const noData = status !== null && status.state === "no_data";
  const overview =
    ok !== null
      ? buildNetworkOverview({ airports: ok.airports, events, stale: ok.stale, hasData: true, now: now ?? new Date() })
      : noData
        ? buildNetworkOverview({
            airports: AIRPORTS.map((a) => ({ airportId: a.id, name: a.name, groundStop: null })),
            events: [],
            stale: false,
            hasData: false,
            now: now ?? new Date(),
          })
        : null;

  const recoveringIds: ReadonlySet<string> = new Set(
    (overview?.affected ?? []).filter((a) => a.kind === "recovering").map((a) => a.airportId),
  );
  const activeStops = new Map<string, { reason: string | null; expectedEnd: string | null }>();
  for (const airport of ok?.airports ?? []) {
    if (airport.groundStop !== null) {
      activeStops.set(airport.airportId, {
        reason: airport.groundStop.reasonText,
        expectedEnd: airport.groundStop.expectedEnd ?? null,
      });
    }
  }
  const recovery = new Map<string, IncidentRecovery>();
  const endedKeys = latestEndedKeys(feed.incidents);
  for (const incident of feed.incidents) {
    if (!endedKeys.has(incident.incidentKey)) continue;
    const view = overview?.affected.find((a) => a.airportId === incident.airportId && a.kind === "recovering");
    if (view === undefined) continue;
    recovery.set(incident.incidentKey, {
      ...(view.sinceText !== undefined ? { sinceText: view.sinceText } : {}),
      ...(view.estimateText !== undefined ? { estimateText: view.estimateText } : {}),
    });
  }
  const listProps = {
    ...(now !== undefined ? { now } : {}),
    activeStops,
    recovery,
    ...(feed.endTimeNotRecorded !== undefined ? { endTimeNotRecorded: feed.endTimeNotRecorded } : {}),
  };
  // "Clear filters" is a secondary button: the page has no primary action.
  const clearFiltersButton = (onClick: () => void) => <Button onClick={onClick}>Clear filters</Button>;

  return (
    <div className="status-view">
      <div aria-live="polite" className="status-view__live">
        {ok !== null && ok.stale ? <StaleDataBanner capturedAt={ok.capturedAt} /> : null}
        {ok !== null && ok.nationwide.active ? (
          <SystemWideBanner explanation={ok.nationwide.explanation} />
        ) : null}
      </div>

      {status === null && loading ? (
        <>
          <LoadingState text="Loading status…" />
          <div aria-hidden="true" className="skeleton-group">
            <span className="skeleton skeleton--block" />
            <span className="skeleton skeleton--block" />
            <span className="skeleton skeleton--block" />
          </div>
        </>
      ) : null}
      {status === null && !loading ? <EmptyState text="No status to show yet." /> : null}
      {status !== null && status.state === "no_data" ? <EmptyState text={status.message} /> : null}
      {noData && overview !== null ? <NetworkOverview overview={overview} capturedAt={null} /> : null}

      {ok !== null ? (
        <div className="status-layout">
          <SectionMenu
            ariaLabel="Status sections"
            items={STATUS_SECTION_IDS.map((id) => ({ id, label: STATUS_SECTION_LABELS[id] }))}
            active={active}
          />
          <div className="status-layout__panes">
            <div id="status-pane-overview" className="status-pane" hidden={active !== "overview"}>
              <h3>Overview</h3>
              {overview !== null ? <NetworkOverview overview={overview} capturedAt={ok.capturedAt} /> : null}
              <h4>Latest events</h4>
              {totalCount === 0 ? (
                <EmptyState text="No events in the last 24 hours." />
              ) : (
                <IncidentList feed={latestFeed} {...listProps} />
              )}
              <p>
                <a className="standalone" href="#events">
                  View all events
                </a>
              </p>
            </div>
            <div id="status-pane-events" className="status-pane" hidden={active !== "events"}>
              <h3>Events in the last 24 hours</h3>
              <EventFilters airports={ok.airports} value={eventFilter} onChange={setEventFilter} />
              {/* A polite status region of its own, apart from the banner region above. The text
                  changes only when a count changes, so that is the only time it is announced. */}
              <p className="event-count" role="status" aria-live="polite">
                {`Showing ${shownCount} of ${totalCount} incidents`}
              </p>
              {totalCount === 0 ? <EmptyState text="No events in the last 24 hours." /> : null}
              {totalCount > 0 && shownCount === 0 ? (
                <EmptyState text="No events match these filters." action={clearFiltersButton(clearEventFilters)} />
              ) : null}
              {shownCount > 0 ? <IncidentList feed={shownFeed} {...listProps} /> : null}
            </div>
            <div id="status-pane-airports" className="status-pane" hidden={active !== "airports"}>
              <h3>Airports</h3>
              <div role="group" aria-label="Filter airports" className="segment-control">
                <Button
                  variant="secondary"
                  className="segment-control__option"
                  aria-pressed={!affectedOnly}
                  onClick={() => setScope("all")}
                >
                  {!affectedOnly ? <Icon name="check" /> : null}
                  {`All (${ok.airports.length})`}
                </Button>
                <Button
                  variant="secondary"
                  className="segment-control__option"
                  aria-pressed={affectedOnly}
                  onClick={() => setScope("affected")}
                >
                  {affectedOnly ? <Icon name="check" /> : null}
                  {`Affected (${affectedCount})`}
                </Button>
              </div>
              <div className="airport-search">
                <FormLabel htmlFor="airport-search">Search airports</FormLabel>
                <div className="search-field">
                  <Icon name="search" className="search-field__icon" />
                  <TextInput
                    id="airport-search"
                    type="search"
                    value={query}
                    placeholder="Code or city, e.g. LAS or Las Vegas"
                    onChange={(event) => setSearch(event.target.value)}
                    autoComplete="off"
                  />
                  {query !== "" ? (
                    <Button
                      variant="ghost"
                      className="search-field__clear"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch("");
                        focusById("airport-search");
                      }}
                    >
                      <Icon name="close" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="airport-search__count" role="status" aria-live="polite">
                {`Showing ${shown.length} of ${ok.airports.length} airports`}
              </p>
              <AirportTable airports={shown} recoveringIds={recoveringIds} />
              {shown.length === 0 && searching ? (
                <EmptyState text="No airports match your search." action={clearFiltersButton(clearAirportFilters)} />
              ) : null}
              {shown.length === 0 && !searching && affectedOnly ? (
                <EmptyState
                  text="No airports have an active ground stop."
                  action={clearFiltersButton(clearAirportFilters)}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
