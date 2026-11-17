import type { EventSummary, NationalStatusResponse } from "../api/client";
import { formatUtc } from "../lib/format-time";
import { AirportTable } from "./AirportTable";
import { EventList } from "./EventList";
import { StaleDataBanner } from "./StaleDataBanner";
import { SystemWideBanner } from "./SystemWideBanner";

export interface StatusViewProps {
  status: NationalStatusResponse | null;
  events: readonly EventSummary[];
  loading: boolean;
}

export function StatusView({ status, events, loading }: StatusViewProps) {
  const ok = status !== null && status.state === "ok" ? status : null;

  return (
    <div className="status-view">
      <div aria-live="polite" className="status-view__live">
        {ok !== null && ok.stale ? <StaleDataBanner capturedAt={ok.capturedAt} /> : null}
        {ok !== null && ok.nationwide.active ? (
          <SystemWideBanner explanation={ok.nationwide.explanation} />
        ) : null}
      </div>

      {status === null && loading ? <p>Loading status…</p> : null}
      {status !== null && status.state === "no_data" ? <p>{status.message}</p> : null}

      {ok !== null ? (
        <>
          <p>
            Data captured{" "}
            <time dateTime={ok.capturedAt}>{formatUtc(ok.capturedAt)}</time>.
          </p>
          <AirportTable airports={ok.airports} />
          <h2>Events in the last 24 hours</h2>
          <EventList events={events} />
        </>
      ) : null}
    </div>
  );
}
