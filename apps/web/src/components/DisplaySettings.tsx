import { useState } from "react";
import { useFeatures } from "../features/use-features";
import { CONTRAST_KEY, THEME_CHANGE_EVENT, THEME_KEY } from "../theme/ThemeController";

type ThemePreference = "system" | "light" | "dark";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function ThemeControl() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  const choose = (next: ThemePreference): void => {
    setPreference(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage is blocked. The choice is not saved, but the controller is still told to re-resolve.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <fieldset className="display-settings__group">
      <legend>Theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="display-settings__option">
          <input
            type="radio"
            name="aerobrief-theme"
            value={option.value}
            checked={preference === option.value}
            onChange={() => choose(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function readContrast(): boolean {
  try {
    return window.localStorage.getItem(CONTRAST_KEY) === "high";
  } catch {
    return false;
  }
}

function ContrastControl() {
  const [high, setHigh] = useState<boolean>(readContrast);

  const change = (next: boolean): void => {
    setHigh(next);
    try {
      window.localStorage.setItem(CONTRAST_KEY, next ? "high" : "standard");
    } catch {
      // Storage is blocked. The choice is not saved, but the controller is still told to re-resolve.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <div className="display-settings__contrast">
      <label className="display-settings__option">
        <input
          type="checkbox"
          name="aerobrief-contrast"
          checked={high}
          aria-describedby="display-settings-contrast-hint"
          onChange={(event) => change(event.target.checked)}
        />
        High contrast
      </label>
      <p id="display-settings-contrast-hint" className="display-settings__hint">
        Stronger colors and thicker outlines
      </p>
    </div>
  );
}

/** "Display settings" section.
 Renders nothing while both darkMode and highContrast are off. */
export function DisplaySettings() {
  const { darkMode, highContrast } = useFeatures();
  if (!darkMode && !highContrast) return null;
  return (
    <section className="display-settings" aria-labelledby="display-settings-heading">
      <h3 id="display-settings-heading" className="display-settings__title">
        Display settings
      </h3>
      {darkMode ? <ThemeControl /> : null}
      {highContrast ? <ContrastControl /> : null}
    </section>
  );
}
