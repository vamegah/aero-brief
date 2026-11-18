import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

/** Native text input. Pair it with a FormLabel whose htmlFor matches this input's id. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { type = "text", className, ...rest },
  ref,
) {
  const classes = ["text-input", className].filter(Boolean).join(" ");
  return <input {...rest} ref={ref} type={type} className={classes} />;
});
