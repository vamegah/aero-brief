import type { AirportSummary } from "../api/client";
import { formatUtc } from "../lib/format-time";
import { MetricChip } from "./MetricChip";

export interface SummaryCardProps {
  airports: readonly AirportSummary[];
  nationwide: { active: boolean; count: number };
  capturedAt: string;
}

export function overallStatusText(groundStops: number, nationwideActive: boolean): string {
  if (nationwideActive) return "System-wide disruption";
  return groundStops > 0 ? "Ground stops active" : "Normal";
}

/** National summary: overall status text, two counts and the last-updated time. */
export function SummaryCard({ airports, nationwide, capturedAt }: SummaryCardProps) {
  const groundStops = airports.filter((a) => a.groundStop !== null).length;
  return (
    <section className="summary-card" aria-label="National summary">
      <MetricChip label="Overall" value={overallStatusText(groundStops, nationwide.active)} />
      <MetricChip label="Ground stops" value={groundStops} />
      <MetricChip label="Affected ARTCCs" value={nationwide.count} />
      <p className="summary-card__updated">
        Last updated <time dateTime={capturedAt}>{formatUtc(capturedAt)}</time>
      </p>
    </section>
  );
}
