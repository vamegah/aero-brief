import { useState } from "react";
import { ApiResponseError, postJson } from "../api/auth";
import { Button } from "../components/Button";
import { ErrorRegion } from "../components/ErrorRegion";
import { Icon } from "../components/Icon";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
const INVALID_LINK = "This link is invalid or has expired.";
const GENERIC_ERROR = "Something went wrong. Try the link again.";
/** `?u=&s=` from the digest email link, or null when either is missing or empty. */
function readDigestParams(search: string): { userId: string; sig: string } | null {
  const q = new URLSearchParams(search);
  const userId = q.get("u");
  const sig = q.get("s");
  if (!userId || !sig) return null;
  return { userId, sig };
}
/** Shown only while `digests` is on (App.tsx decides). Needs an explicit confirm click, so a mail scanner that opens the link cannot unsubscribe. */
export function DigestUnsubscribePage() {
  const params = readDigestParams(window.location.search);
  const [error, setError] = useState<string | null>(params === null ? INVALID_LINK : null);
  const [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false);
  async function onConfirm() {
    if (params === null) return;
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/digest/unsubscribe", { userId: params.userId, sig: params.sig });
      setStopped(true);
    } catch (err) {
      const invalid = err instanceof ApiResponseError && (err.status === 403 || err.status === 400);
      setError(invalid ? INVALID_LINK : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="digest-unsubscribe-heading">
      <PageHeader titleId="digest-unsubscribe-heading" title="Daily digest" />
      <ErrorRegion message={error} />
      <div role="status">
        {stopped ? (
          <p>
            <Icon name="check" /> Your daily digest is turned off. You will not get any more daily digest emails.
          </p>
        ) : null}
      </div>
      {busy ? <LoadingState text="Turning off your daily digest..." /> : null}
      {!stopped && params !== null && !busy ? (
        <>
          <p>Stop the daily digest email?</p>
          <Button variant="primary" onClick={() => void onConfirm()}>
            Confirm unsubscribe
          </Button>
        </>
      ) : null}
      {!busy && (stopped || error !== null) ? (
        <p>
          <a href="/watchlist">Go to your watchlist</a>
        </p>
      ) : null}
    </section>
  );
}
