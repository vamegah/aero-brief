import type { HTMLAttributes } from "react";

export interface MetricChipProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  value: string | number;
}

/** Label and value as plain text, for example "Ground stops: 2". */
export function MetricChip({ label, value, className, ...rest }: MetricChipProps) {
  const classes = ["metric-chip", className].filter(Boolean).join(" ");
  return (
    <span {...rest} className={classes}>
      <span className="metric-chip__label">{label}:</span>{" "}
      <span className="metric-chip__value">{value}</span>
    </span>
  );
}
