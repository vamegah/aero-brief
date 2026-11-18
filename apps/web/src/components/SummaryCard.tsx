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

/** Decorative tone modifier for the hero value; the text stays the primary signal. */
export function overallTone(overall: string): "normal" | "warning" | "critical" {
  if (overall === "System-wide disruption") return "critical";
  return overall === "Ground stops active" ? "warning" : "normal";
}

/** National summary: overall status text, two counts and the last-updated time. */
export function SummaryCard({ airports, nationwide, capturedAt }: SummaryCardProps) {
  const groundStops = airports.filter((a) => a.groundStop !== null).length;
  const overall = overallStatusText(groundStops, nationwide.active);
  const tone = overallTone(overall);
  return (
    <section className="summary-card" aria-label="National summary">
      <MetricChip
        className={`summary-card__hero summary-card__hero--${tone}`}
        label="Overall"
        value={overall}
      />
      <MetricChip label="Ground stops" value={groundStops} />
      <MetricChip label="Affected ARTCCs" value={nationwide.count} />
      <p className="summary-card__updated">
        Last updated <time dateTime={capturedAt}>{formatUtc(capturedAt)}</time>
      </p>
    </section>
  );
}
