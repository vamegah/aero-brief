import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";

export type StatusPillVariant = "active" | "normal";

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visible status text, for example "Ground stop" or "No ground stop reported". */
  text: string;
  /** Decoration only. The text carries the meaning. */
  variant: StatusPillVariant;
}

export function StatusPill({ text, variant, className, ...rest }: StatusPillProps) {
  const classes = ["status-pill", `status-pill--${variant}`, className].filter(Boolean).join(" ");
  return (
    <span {...rest} className={classes}>
      <Icon name={variant === "active" ? "alert" : "check"} />
      <span className="status-pill__text">{text}</span>
    </span>
  );
}
