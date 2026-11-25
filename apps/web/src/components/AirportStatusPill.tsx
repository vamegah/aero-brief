import type { HTMLAttributes } from "react";
import { STATUS_CATALOG, type AirportStatusKind } from "@aerobrief/core/status-derivation";
import { Icon } from "./Icon";

export interface AirportStatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  kind: AirportStatusKind;
  /** Overrides the catalog label, for example "Recovering, 3 hours ago". */
  text?: string;
}

/**
 * One of the six Airport_Status kinds: a distinct icon, color and text label (Requirement 1.8).
 * The text alone conveys the status; the icon is an aria-hidden CSS mask span and color repeats it.
 */
export function AirportStatusPill({ kind, text, className, ...rest }: AirportStatusPillProps) {
  const entry = STATUS_CATALOG[kind];
  const classes = ["status-pill", `status-pill--${kind.replace(/_/g, "-")}`, className].filter(Boolean).join(" ");
  return (
    <span {...rest} className={classes} data-status-kind={kind}>
      <Icon name={entry.icon} />
      <span className="status-pill__text">{text ?? entry.label}</span>
    </span>
  );
}
