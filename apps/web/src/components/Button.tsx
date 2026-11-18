import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Native button. Defaults to type="button" so it never submits a form by accident. */
export function Button({
  variant = "secondary",
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button {...rest} type={type} className={classes}>
      {children}
    </button>
  );
}
