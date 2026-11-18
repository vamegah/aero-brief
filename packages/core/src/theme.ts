// Pure theme resolution. No window, localStorage or matchMedia access.
export type ThemeVariant = "light" | "dark" | "hc-light" | "hc-dark";

export interface ThemeInput {
  darkFlag: boolean;
  contrastFlag: boolean;
  /** Raw local storage value for `aerobrief.theme`. */
  storedTheme: string | null;
  /** Raw local storage value for `aerobrief.contrast`. */
  storedContrast: string | null;
  /** Result of `prefers-color-scheme: dark`. */
  systemDark: boolean;
}

/** Total function: never throws, always returns exactly one variant. */
export function resolveTheme(input: ThemeInput): ThemeVariant {
  const i = (input ?? {}) as Partial<Record<keyof ThemeInput, unknown>>;
  let mode: "light" | "dark" = "light";
  if (i.darkFlag === true) {
    if (i.storedTheme === "light") mode = "light";
    else if (i.storedTheme === "dark") mode = "dark";
    else mode = i.systemDark === true ? "dark" : "light";
  }
  const high = i.contrastFlag === true && i.storedContrast === "high";
  return high ? (mode === "dark" ? "hc-dark" : "hc-light") : mode;
}
