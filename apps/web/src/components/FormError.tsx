import type { HTMLAttributes } from "react";

/**
 * Error message text only. It sets no role or aria-live: the existing ErrorRegion owns
 * role="alert", and a caller wraps or composes this where an alert is wanted.
 */
export function FormError({
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLParagraphElement>, "role">) {
  const classes = ["form-error", className].filter(Boolean).join(" ");
  return (
    <p {...rest} className={classes}>
      {children}
    </p>
  );
}
