import { useEffect } from "react";
import { resolveTheme, type ThemeVariant } from "@aerobrief/core/theme";
import { useFeatures } from "../features/use-features";

export const THEME_KEY = "aerobrief.theme";
export const CONTRAST_KEY = "aerobrief.contrast";
/**
 * DisplaySettings (task 2.9) writes local storage, then dispatches this event on `window`
 * (`window.dispatchEvent(new Event(THEME_CHANGE_EVENT))`) so the controller re-resolves the variant.
 */
export const THEME_CHANGE_EVENT = "aerobrief-theme-change";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage can throw (blocked, private mode)
  }
}

function apply(variant: ThemeVariant): void {
  const root = document.documentElement;
  if (variant === "light") delete root.dataset.theme;
  else root.dataset.theme = variant;
}

/** Applies the resolved theme variant to `<html data-theme>`. Mounted only while darkMode is on. */
function ActiveThemeController({ highContrast }: { highContrast: boolean }) {
  useEffect(() => {
    const mql = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
    const update = (): void => {
      apply(
        resolveTheme({
          darkFlag: true,
          contrastFlag: highContrast,
          storedTheme: readStorage(THEME_KEY),
          storedContrast: readStorage(CONTRAST_KEY),
          systemDark: mql?.matches ?? false,
        }),
      );
    };
    update();
    mql?.addEventListener("change", update);
    window.addEventListener(THEME_CHANGE_EVENT, update);
    return () => {
      mql?.removeEventListener("change", update);
      window.removeEventListener(THEME_CHANGE_EVENT, update);
      delete document.documentElement.dataset.theme;
    };
  }, [highContrast]);
  return null;
}

export function ThemeController() {
  const { darkMode, highContrast } = useFeatures();
  if (!darkMode) return null;
  return <ActiveThemeController highContrast={highContrast} />;
}
