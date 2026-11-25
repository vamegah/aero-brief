import { useState } from "react";
import { AIRPORTS } from "@aerobrief/core/airports";
import type { EventSummary, NationalStatusResponse } from "../api/client";
import { matchesAirportSearch } from "../lib/airport-search";
import { NO_EVENT_FILTER, type EventFilter } from "../lib/filter-events";
import {
  buildIncidentFeed,
  feedSize,
  filterIncidentFeed,
  latestEndedKeys,
  limitFeed,
} from "../lib/incident-feed";
import { STATUS_SECTION_IDS, STATUS_SECTION_LABELS, resolveStatusSection } from "../lib/status-sections";
import { useLocationHash } from "../hooks/use-location-hash";
import { buildNetworkOverview } from "../lib/network-overview";
import { sortAirports } from "../lib/sort-airports";
import { AirportTable } from "./AirportTable";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventFilters } from "./EventFilters";
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
  const [affectedOnly, setAffectedOnly] = useState(false);
  const sorted = ok === null ? [] : sortAirports(ok.airports);
  const [query, setQuery] = useState("");
  const filtered = affectedOnly ? sorted.filter((airport) => airport.groundStop !== null) : sorted;
  const shown = filtered.filter((airport) => matchesAirportSearch(airport, query));
  const searching = query.trim() !== "";
  const active = resolveStatusSection(useLocationHash());
  const [eventFilter, setEventFilter] = useState<EventFilter>(NO_EVENT_FILTER);
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
  const listProps = { ...(now !== undefined ? { now } : {}), activeStops, recovery };

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
              <p className="event-count">{`Showing ${shownCount} of ${totalCount} incidents`}</p>
              {totalCount === 0 ? <EmptyState text="No events in the last 24 hours." /> : null}
              {totalCount > 0 && shownCount === 0 ? <EmptyState text="No events match these filters." /> : null}
              {shownCount > 0 ? <IncidentList feed={shownFeed} {...listProps} /> : null}
            </div>
            <div id="status-pane-airports" className="status-pane" hidden={active !== "airports"}>
              <h3>Airports</h3>
              <div role="group" aria-label="Filter airports" className="segment-control">
                <Button
                  variant="secondary"
                  className="segment-control__option"
                  aria-pressed={!affectedOnly}
                  onClick={() => setAffectedOnly(false)}
                >
                  {`All (${ok.airports.length})`}
                </Button>
                <Button
                  variant="secondary"
                  className="segment-control__option"
                  aria-pressed={affectedOnly}
                  onClick={() => setAffectedOnly(true)}
                >
                  Affected only
                </Button>
              </div>
              <div className="airport-search">
                <FormLabel htmlFor="airport-search">Search airports</FormLabel>
                <TextInput
                  id="airport-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <p className="airport-search__count">{`Showing ${shown.length} of ${ok.airports.length} airports`}</p>
              <AirportTable airports={shown} />
              {shown.length === 0 && searching ? <EmptyState text="No airports match your search." /> : null}
              {shown.length === 0 && !searching ? (
                <EmptyState text="No airports have an active ground stop." />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
