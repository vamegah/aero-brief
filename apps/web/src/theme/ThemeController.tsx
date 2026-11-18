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

/**
 * Applies the resolved theme variant to `<html data-theme>`. Mounted while darkMode or highContrast
 * is on. The theme key and the dark media query are used only while darkMode is on; the contrast
 * key is read only while highContrast is on. `prefers-contrast` is never queried.
 */
function ActiveThemeController({
  darkMode,
  highContrast,
}: {
  darkMode: boolean;
  highContrast: boolean;
}) {
  useEffect(() => {
    const mql =
      darkMode && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
    const update = (): void => {
      apply(
        resolveTheme({
          darkFlag: darkMode,
          contrastFlag: highContrast,
          storedTheme: darkMode ? readStorage(THEME_KEY) : null,
          storedContrast: highContrast ? readStorage(CONTRAST_KEY) : null,
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
  }, [darkMode, highContrast]);
  return null;
}

export function ThemeController() {
  const { darkMode, highContrast } = useFeatures();
  if (!darkMode && !highContrast) return null;
  return <ActiveThemeController darkMode={darkMode} highContrast={highContrast} />;
}
