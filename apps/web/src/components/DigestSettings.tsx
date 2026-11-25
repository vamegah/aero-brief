import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchDigest, saveDigest } from "../api/digest";
import { ApiRequestError } from "../api/client";
import { Button } from "./Button";
import { FormLabel } from "./FormLabel";
import { LoadingState } from "./LoadingState";

import { hourWithLocalEquivalent } from "../lib/digest-local-time";

const DEFAULT_HOUR = 7;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00 UTC`;
}

/**
 * "Daily digest" section of the Watchlist page. The parent mounts it only while the `digests`
 * flag is on. `watchlistCount` is null while the Watchlist loads. The save result goes to an
 * always-mounted polite live region and focus stays on the Save button.
 */
export function DigestSettings({ watchlistCount }: { watchlistCount: number | null }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setLoadError(null);
    fetchDigest(controller.signal)
      .then((pref) => {
        setEnabled(pref.enabled);
        setHour(pref.hour);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof ApiRequestError ? err.message : "Could not load your digest settings.");
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [attempt]);

  async function onSubmit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    setBusy(true);
    setShowSaved(false);
    setSaveError(null);
    setMessage("");
    try {
      const saved = await saveDigest({ enabled, hour });
      if (!mounted.current) return;
      setEnabled(saved.enabled);
      setHour(saved.hour);
      setMessage("Digest settings saved.");
      setShowSaved(true);
    } catch (err) {
      if (!mounted.current) return;
      const text = err instanceof ApiRequestError ? err.message : "Could not save your digest settings.";
      setSaveError(text);
      setMessage(text);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="digest-settings" aria-labelledby="digest-heading">
      <h3 id="digest-heading">Daily digest</h3>
      {loadError !== null ? (
        <div className="digest-settings__status">
          <p>{loadError}</p>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      ) : !loaded ? (
        <LoadingState text="Loading your digest settings…" />
      ) : (
        <form className="digest-settings__form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <label className="digest-settings__option">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setShowSaved(false);
              }}
            />
            Send me a daily digest
          </label>
          {watchlistCount === 0 ? (
            <p className="digest-settings__hint">Add an airport to receive a digest</p>
          ) : null}
          <FormLabel htmlFor="digest-hour">Send at (UTC)</FormLabel>
          <select
            id="digest-hour"
            className="digest-settings__select"
            value={hour}
            disabled={busy}
            onChange={(e) => {
              setHour(Number(e.target.value));
              setShowSaved(false);
            }}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <p id="digest-hour-local" className="digest-settings__local" aria-live="polite">
            {hourWithLocalEquivalent(hour, browserTimeZone(), new Date())}
          </p>
          {saveError !== null ? (
            <div className="digest-settings__error">
              <p>{saveError}</p>
              <Button variant="secondary" disabled={busy} onClick={() => void onSubmit()}>
                Retry
              </Button>
            </div>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy}>
            Save digest settings
          </Button>
          {showSaved ? (
            <p className="digest-settings__saved" aria-hidden="true">
              Saved
            </p>
          ) : null}
        </form>
      )}
      <div aria-live="polite" className="digest-settings__live">
        {message}
      </div>
    </section>
  );
}
