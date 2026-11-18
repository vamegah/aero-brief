import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  text: string;
  /** Optional action, for example a link or Button. */
  action?: ReactNode;
}

export function EmptyState({ text, action, className, ...rest }: EmptyStateProps) {
  const classes = ["empty-state", className].filter(Boolean).join(" ");
  return (
    <div {...rest} className={classes}>
      <Icon name="empty" />
      <p className="empty-state__text">{text}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
