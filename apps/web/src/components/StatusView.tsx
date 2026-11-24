import { useState } from "react";
import type { EventSummary, NationalStatusResponse } from "../api/client";
import { matchesAirportSearch } from "../lib/airport-search";
import { formatUtc } from "../lib/format-time";
import { NO_EVENT_FILTER, filterEvents, type EventFilter } from "../lib/filter-events";
import { STATUS_SECTION_IDS, STATUS_SECTION_LABELS, resolveStatusSection } from "../lib/status-sections";
import { useLocationHash } from "../hooks/use-location-hash";
import { sortAirports } from "../lib/sort-airports";
import { AirportTable } from "./AirportTable";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventFilters } from "./EventFilters";
import { EventList } from "./EventList";
import { SectionMenu } from "./SectionMenu";
import { FormLabel } from "./FormLabel";
import { TextInput } from "./TextInput";
import { LoadingState } from "./LoadingState";
import { StaleDataBanner } from "./StaleDataBanner";
import { SummaryCard } from "./SummaryCard";
import { SystemWideBanner } from "./SystemWideBanner";

export interface StatusViewProps {
  status: NationalStatusResponse | null;
  events: readonly EventSummary[];
  loading: boolean;
}

const LATEST_EVENT_COUNT = 5;

function DataAsOfLine({ capturedAt }: { capturedAt: string }) {
  return (
    <p className="data-as-of">
      Data as of <time dateTime={capturedAt}>{formatUtc(capturedAt)}</time>
    </p>
  );
}

export function StatusView({ status, events, loading }: StatusViewProps) {
  const ok = status !== null && status.state === "ok" ? status : null;
  const [affectedOnly, setAffectedOnly] = useState(false);
  const sorted = ok === null ? [] : sortAirports(ok.airports);
  const [query, setQuery] = useState("");
  const filtered = affectedOnly ? sorted.filter((airport) => airport.groundStop !== null) : sorted;
  const shown = filtered.filter((airport) => matchesAirportSearch(airport, query));
  const searching = query.trim() !== "";
  const active = resolveStatusSection(useLocationHash());
  const [eventFilter, setEventFilter] = useState<EventFilter>(NO_EVENT_FILTER);
  const shownEvents = filterEvents(events, eventFilter);

  return (
    <div className="status-view">
      <div aria-live="polite" className="status-view__live">
        {ok !== null && ok.stale ? <StaleDataBanner capturedAt={ok.capturedAt} /> : null}
        {ok !== null && ok.nationwide.active ? (
          <SystemWideBanner explanation={ok.nationwide.explanation} />
        ) : null}
      </div>

      {status === null && loading ? <LoadingState text="Loading status…" /> : null}
      {status === null && !loading ? <EmptyState text="No status to show yet." /> : null}
      {status !== null && status.state === "no_data" ? <EmptyState text={status.message} /> : null}

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
              <SummaryCard airports={ok.airports} nationwide={ok.nationwide} capturedAt={ok.capturedAt} />
              <h4>Latest events</h4>
              <EventList events={events.slice(0, LATEST_EVENT_COUNT)} />
              <p>
                <a className="standalone" href="#events">
                  View all events
                </a>
              </p>
            </div>
            <div id="status-pane-events" className="status-pane" hidden={active !== "events"}>
              <h3>Events in the last 24 hours</h3>
              <DataAsOfLine capturedAt={ok.capturedAt} />
              <EventFilters airports={ok.airports} value={eventFilter} onChange={setEventFilter} />
              <p className="event-count">{`Showing ${shownEvents.length} of ${events.length} events`}</p>
              {events.length === 0 ? <EmptyState text="No events in the last 24 hours." /> : null}
              {events.length > 0 && shownEvents.length === 0 ? (
                <EmptyState text="No events match these filters." />
              ) : null}
              {shownEvents.length > 0 ? <EventList events={shownEvents} /> : null}
            </div>
            <div id="status-pane-airports" className="status-pane" hidden={active !== "airports"}>
              <h3>Airports</h3>
              <DataAsOfLine capturedAt={ok.capturedAt} />
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
