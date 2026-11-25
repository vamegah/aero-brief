import { useEffect, useRef, useState } from "react";
import { freshnessChanged, type Freshness } from "../lib/freshness";
import { Icon, type IconName } from "./Icon";
import { TimeText } from "./TimeText";

export type FreshnessChipProps = {
  freshness: Freshness;
  /** ISO timestamp of the data on screen, or null when nothing has loaded. */
  capturedAt: string | null;
  /** True while the first status request runs. No freshness is announced until it settles. */
  loading?: boolean;
};

const LABELS: Record<Freshness, string> = {
  live: "Live",
  delayed: "Delayed",
  unavailable: "Unavailable",
};

const ICONS: Record<Freshness, IconName> = {
  live: "check",
  delayed: "clock-arrow",
  unavailable: "question-mark",
};

/**
 * Data freshness in the page header (Requirement 9). Text carries the state, color only repeats it.
 * The exact timestamp is the TimeText tooltip. A separate visually hidden polite region announces a
 * change of freshness, and stays silent when it does not change.
 */
export function FreshnessChip({ freshness, capturedAt, loading = false }: FreshnessChipProps) {
  const previous = useRef<Freshness | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (loading) return;
    if (previous.current !== null && freshnessChanged(previous.current, freshness)) {
      setAnnouncement(`Data freshness: ${LABELS[freshness]}`);
    }
    previous.current = freshness;
  }, [freshness, loading]);

  if (loading) {
    return (
      <span className="freshness-chip freshness-chip--loading" data-testid="freshness-chip">
        <span aria-hidden="true" className="skeleton skeleton--chip" />
        <span className="freshness-chip__label">Checking data freshness…</span>
      </span>
    );
  }

  return (
    <span className={`freshness-chip freshness-chip--${freshness}`} data-testid="freshness-chip">
      <Icon name={ICONS[freshness]} />
      <span className="freshness-chip__label">{LABELS[freshness]}</span>
      {capturedAt !== null ? (
        <span className="freshness-chip__time">
          <span>Updated </span>
          <TimeText iso={capturedAt} />
        </span>
      ) : null}
      <span role="status" className="visually-hidden">
        {announcement}
      </span>
    </span>
  );
}
