import { useState } from "react";
import { useFeatures } from "../features/use-features";
import { setDisplayMode, useDisplayMode } from "../hooks/use-display-mode";
import type { DisplayMode } from "../lib/time-text";
import { themePalettes } from "../styles/themes";
import { CONTRAST_KEY, THEME_CHANGE_EVENT, THEME_KEY } from "../theme/ThemeController";

type ThemePreference = "system" | "light" | "dark";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const TIME_OPTIONS: ReadonlyArray<{ value: DisplayMode; label: string }> = [
  { value: "relative", label: "Relative (for example, 25 min ago)" },
  { value: "airport_local", label: "Airport local time" },
  { value: "my_local", label: "My local time" },
  { value: "utc", label: "UTC" },
];

function TimeDisplayControl() {
  const mode = useDisplayMode();
  return (
    <fieldset className="display-settings__group">
      <legend>Time display</legend>
      {TIME_OPTIONS.map((option) => (
        <label key={option.value} className="display-settings__option">
          <input
            type="radio"
            name="aerobrief-time-display"
            value={option.value}
            checked={mode === option.value}
            onChange={() => setDisplayMode(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** The theme the OS asks for right now, matching ThemeController's own resolution. */
function resolveSystem(): "light" | "dark" {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
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

  const selected = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0]!;

  return (
    <fieldset className="display-settings__group">
      <legend>Theme</legend>
      <div className="display-settings__segments">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="display-settings__segment"
            data-selected={preference === option.value ? "true" : "false"}
          >
            <input
              type="radio"
              name="aerobrief-theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => choose(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <ul className="display-settings__preview" data-testid="theme-preview" data-preview={selected.value}>
        {OPTIONS.map((option) => {
          const colors = themePalettes[option.value === "system" ? resolveSystem() : option.value];
          return (
            <li
              key={option.value}
              className="display-settings__preview-item"
              data-swatch={option.value}
              data-selected={preference === option.value ? "true" : "false"}
            >
              <span
                className="display-settings__swatch"
                aria-hidden="true"
                style={{
                  background: colors["color-surface-raised"],
                  borderColor: colors["color-border"],
                  color: colors["color-text-primary"],
                }}
              >
                Aa
              </span>
              <span>{option.label}</span>
            </li>
          );
        })}
      </ul>
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

/** "Display settings" section. The time control is always shown; theme controls follow their flags. */
export function DisplaySettings() {
  const { darkMode, highContrast } = useFeatures();
  return (
    <section className="display-settings" aria-labelledby="display-settings-heading">
      <h3 id="display-settings-heading" className="display-settings__title">
        Display settings
      </h3>
      <TimeDisplayControl />
      {darkMode ? <ThemeControl /> : null}
      {highContrast ? <ContrastControl /> : null}
    </section>
  );
}
