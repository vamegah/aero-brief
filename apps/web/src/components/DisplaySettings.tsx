import { useState } from "react";
import { useFeatures } from "../features/use-features";
import { THEME_CHANGE_EVENT, THEME_KEY } from "../theme/ThemeController";

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

/** "Display settings" section. Renders nothing while both darkMode and highContrast are off. */
export function DisplaySettings() {
  const { darkMode, highContrast } = useFeatures();
  if (!darkMode && !highContrast) return null;
  return (
    <section className="display-settings" aria-labelledby="display-settings-heading">
      <h2 id="display-settings-heading" className="display-settings__title">
        Display settings
      </h2>
      {darkMode ? <ThemeControl /> : null}
      {/* Task 3.5 adds the "High contrast" checkbox here, shown when highContrast is on. */}
    </section>
  );
}
