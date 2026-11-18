import { useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchAirportHistory,
  fetchAirportStatus,
  type AirportStatusResponse,
  type EventSummary,
} from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ErrorRegion } from "../components/ErrorRegion";
import { EventList } from "../components/EventList";
import { GroundStopDetails } from "../components/GroundStopDetails";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { StaleDataBanner } from "../components/StaleDataBanner";
import { StatusPill } from "../components/StatusPill";
import { selectDisplayEvents } from "../lib/display-window";
import { formatUtc } from "../lib/format-time";
import { NotFoundPage } from "./NotFoundPage";

export const AIRPORT_ERROR_TEXT = "Could not load this airport. Reload the page to try again.";
export const AIRPORT_EMPTY_EVENTS_TEXT = "No events for this airport in the last 24 hours.";

/** Airport id from `/airport/<id>`: 3 or 4 letters, upper-cased. Null for anything else. */
export function airportIdFromPath(pathname: string): string | null {
  const match = /^\/airport\/([A-Za-z]{3,4})\/?$/.exec(pathname);
  return match?.[1] === undefined ? null : match[1].toUpperCase();
}

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "loaded"; status: AirportStatusResponse; events: EventSummary[] };

export function AirportPage({ airportId }: { airportId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    Promise.all([
      fetchAirportStatus(airportId, controller.signal),
      fetchAirportHistory(airportId, controller.signal),
    ]).then(
      ([status, history]) => {
        if (controller.signal.aborted) return;
        setState({ kind: "loaded", status, events: selectDisplayEvents(history, new Date()) });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const missing = error instanceof ApiRequestError && error.status === 404;
        setState({ kind: missing ? "not-found" : "error" });
      },
    );
    return () => controller.abort();
  }, [airportId]);

  if (state.kind === "not-found") return <NotFoundPage />;

  const ok = state.kind === "loaded" && state.status.state === "ok" ? state.status : null;
  const title = ok !== null ? `${ok.airport.name} (${airportId})` : `Airport ${airportId}`;

  return (
    <section aria-labelledby="airport-heading">
      <PageHeader
        titleId="airport-heading"
        title={title}
        action={<a href="/">Back to national status</a>}
      />
      <div aria-live="polite" className="status-view__live">
        {ok !== null && ok.stale ? <StaleDataBanner capturedAt={ok.capturedAt} /> : null}
      </div>
      <ErrorRegion message={state.kind === "error" ? AIRPORT_ERROR_TEXT : null} />

      {state.kind === "loading" ? <LoadingState text="Loading airport status…" /> : null}
      {state.kind === "loaded" && state.status.state === "no_data" ? (
        <EmptyState text={state.status.message} />
      ) : null}

      {ok !== null && state.kind === "loaded" ? (
        <>
          <section className="summary-card" aria-label="Current status">
            {ok.airport.groundStop !== null ? (
              <>
                <StatusPill variant="active" text="Ground stop" />
                <GroundStopDetails stop={ok.airport.groundStop} />
              </>
            ) : (
              <StatusPill variant="normal" text="No ground stop reported" />
            )}
            <p className="summary-card__updated">
              Last updated <time dateTime={ok.capturedAt}>{formatUtc(ok.capturedAt)}</time>
            </p>
          </section>
          <h3>Last 24 hours</h3>
          {state.events.length === 0 ? (
            <EmptyState text={AIRPORT_EMPTY_EVENTS_TEXT} />
          ) : (
            <EventList events={state.events} />
          )}
        </>
      ) : null}
    </section>
  );
}
