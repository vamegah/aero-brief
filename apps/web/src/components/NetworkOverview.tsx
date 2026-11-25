import type { NetworkOverview as NetworkOverviewData } from "../lib/network-overview";
import { AirportStatusPill } from "./AirportStatusPill";
import { MetricChip } from "./MetricChip";
import { TimeText } from "./TimeText";

export interface NetworkOverviewProps {
  overview: NetworkOverviewData;
  /** ISO time of the snapshot, or null when no status data exists. */
  capturedAt: string | null;
}

/** Network_Summary: headline, two summary chips, named affected airports (Requirements 1.3 to 1.7). */
export function NetworkOverview({ overview, capturedAt }: NetworkOverviewProps) {
  const { summary, affected, outdated, showAllNormal, headline, latestEventAt } = overview;
  return (
    <section className="summary-card" aria-label="National summary">
      <p className="summary-card__headline">{headline}</p>
      {showAllNormal ? (
        <p className="summary-card__latest">
          {latestEventAt === null ? (
            "No events in the last 24 hours"
          ) : (
            <>
              Most recent event <TimeText iso={latestEventAt} />
            </>
          )}
        </p>
      ) : null}
      <MetricChip label="Ground stops" value={summary.counts.ground_stop} />
      <MetricChip label="Recovering" value={summary.counts.recovering} />
      {affected.length > 0 ? (
        <ul className="summary-card__affected">
          {affected.map((airport) => (
            <li key={airport.airportId} className="summary-card__affected-item">
              <span className="summary-card__airport">{`${airport.name} (${airport.airportId})`}</span>{" "}
              <AirportStatusPill kind={airport.kind} />
              {outdated ? <span className="summary-card__outdated"> (outdated)</span> : null}
              {airport.sinceText !== undefined ? <span className="summary-card__since"> {airport.sinceText}.</span> : null}
              {airport.estimateText !== undefined ? (
                <span className="summary-card__estimate"> {airport.estimateText}.</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {capturedAt !== null ? (
        <p className="summary-card__updated">
          Last updated <TimeText iso={capturedAt} />
        </p>
      ) : null}
    </section>
  );
}
