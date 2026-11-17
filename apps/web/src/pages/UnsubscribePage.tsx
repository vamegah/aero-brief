import { useState } from "react";
import { unsubscribe } from "../api/auth";
import { ErrorRegion } from "../components/ErrorRegion";
import { errorText, readUnsubscribeParams } from "../lib/url-params";

export function UnsubscribePage() {
  const params = readUnsubscribeParams(window.location.search);
  const [error, setError] = useState<string | null>(
    params === null ? "This unsubscribe link is incomplete or not valid." : null,
  );
  const [airportName, setAirportName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (params === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unsubscribe(params);
      setAirportName(result.airportName);
    } catch (err) {
      setError(errorText(err, "Could not unsubscribe. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="unsubscribe-heading">
      <h2 id="unsubscribe-heading">Unsubscribe</h2>
      <ErrorRegion message={error} />
      <div role="status">
        {airportName !== null ? <p>You will no longer get alerts for {airportName}.</p> : null}
      </div>
      {airportName === null && params !== null ? (
        <>
          <p>Stop ground stop alerts for this airport?</p>
          <button type="button" onClick={() => void onConfirm()} disabled={busy}>
            {busy ? "Unsubscribing…" : "Confirm unsubscribe"}
          </button>
        </>
      ) : null}
    </section>
  );
}
