import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export type BannerVariant = "stale" | "nationwide" | "error" | "success";

export type BannerProps = Omit<HTMLAttributes<HTMLDivElement>, "role" | "aria-live"> & {
  variant: BannerVariant;
};

const ICONS: Record<BannerVariant, IconName> = {
  stale: "info",
  nationwide: "alert",
  error: "error",
  success: "check",
};

/**
 * Styled banner. It adds no role and no aria-live: the live region and role="alert" belong to
 * the wrappers that already exist. Extra props (such as data-testid) pass through. The icon is an
 * aria-hidden span with no text, so the banner text is exactly its children.
 */
export function Banner({ variant, className, children, ...rest }: BannerProps) {
  const classes = ["ui-banner", `ui-banner--${variant}`, className].filter(Boolean).join(" ");
  return (
    <div {...rest} className={classes}>
      <Icon name={ICONS[variant]} />
      <div className="ui-banner__body">{children}</div>
    </div>
  );
}
