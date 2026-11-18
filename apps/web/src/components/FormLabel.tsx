import type { LabelHTMLAttributes } from "react";

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor: string;
}

/** A <label> bound to a control by id. */
export function FormLabel({ className, children, ...rest }: FormLabelProps) {
  const classes = ["form-label", className].filter(Boolean).join(" ");
  return (
    <label {...rest} className={classes}>
      {children}
    </label>
  );
}
