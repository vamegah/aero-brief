import { useState } from "react";
import { unsubscribe } from "../api/auth";
import { Button } from "../components/Button";
import { ErrorRegion } from "../components/ErrorRegion";
import { Icon } from "../components/Icon";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
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
      <PageHeader titleId="unsubscribe-heading" title="Unsubscribe" />
      <ErrorRegion message={error} />
      <div role="status">
        {airportName !== null ? (
          <p>
            <Icon name="check" /> You will no longer get alerts for {airportName}.
          </p>
        ) : null}
      </div>
      {busy ? <LoadingState text="Unsubscribing…" /> : null}
      {airportName === null && params !== null && !busy ? (
        <>
          <p>Stop ground stop alerts for this airport?</p>
          <Button variant="primary" onClick={() => void onConfirm()}>
            Confirm unsubscribe
          </Button>
        </>
      ) : null}
      {!busy && (airportName !== null || error !== null) ? (
        <p>
          <a href="/watchlist">Go to your watchlist</a>
        </p>
      ) : null}
    </section>
  );
}
