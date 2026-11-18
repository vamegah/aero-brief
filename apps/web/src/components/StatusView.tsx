import { useState } from "react";
import type { EventSummary, NationalStatusResponse } from "../api/client";
import { matchesAirportSearch } from "../lib/airport-search";
import { sortAirports } from "../lib/sort-airports";
import { AirportTable } from "./AirportTable";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventList } from "./EventList";
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

export function StatusView({ status, events, loading }: StatusViewProps) {
  const ok = status !== null && status.state === "ok" ? status : null;
  const [affectedOnly, setAffectedOnly] = useState(false);
  const sorted = ok === null ? [] : sortAirports(ok.airports);
  const [query, setQuery] = useState("");
  const filtered = affectedOnly ? sorted.filter((airport) => airport.groundStop !== null) : sorted;
  const shown = filtered.filter((airport) => matchesAirportSearch(airport, query));
  const searching = query.trim() !== "";

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
        <>
          <SummaryCard airports={ok.airports} nationwide={ok.nationwide} capturedAt={ok.capturedAt} />
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
          <h2>Events in the last 24 hours</h2>
          <EventList events={events} />
        </>
      ) : null}
    </div>
  );
}
