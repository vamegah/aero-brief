import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";

export type LoadingStateProps = Omit<HTMLAttributes<HTMLDivElement>, "aria-live"> & {
  text: string;
};

/** Icon plus text. Deliberately sets no aria-live: the banner region must stay the first one. */
export function LoadingState({ text, className, ...rest }: LoadingStateProps) {
  const classes = ["loading-state", className].filter(Boolean).join(" ");
  return (
    <div {...rest} className={classes}>
      <Icon name="loading" />
      <p className="loading-state__text">{text}</p>
    </div>
  );
}
