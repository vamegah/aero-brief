import { useEffect, useRef, useState } from "react";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorRegion } from "../components/ErrorRegion";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { WatchlistTable } from "../components/WatchlistTable";
import { useStatus } from "../hooks/use-status";
import { useWatchlist } from "../hooks/use-watchlist";
import { consumeSigninFlash, type SigninFlash } from "../lib/signin-flash";

const MAX_WATCHLIST = 10;

export function WatchlistPage() {
  const { status } = useStatus();
  const { watchlist, loading, unauthorized, error, busy, add, remove } = useWatchlist();
  const [flash, setFlash] = useState<SigninFlash | null>(null);
  // Read the flag once (StrictMode runs effects twice). State is set after mount so the text is
  // inserted into the live region that already exists, which is what screen readers announce.
  const flashRead = useRef(false);
  useEffect(() => {
    if (flashRead.current) return;
    flashRead.current = true;
    setFlash(consumeSigninFlash());
  }, []);

  const airports = status !== null && status.state === "ok" ? status.airports : [];

  if (unauthorized) {
    return (
      <>
        <PageHeader title="Your watchlist" />
        <ErrorRegion message="Sign in to see your watchlist." />
        <p>
          <a href="/sign-in">Go to sign in</a>
        </p>
      </>
    );
  }

  const counter = loading ? undefined : (
    <span role="status" className="metric-chip">
      <span className="metric-chip__value">
        {watchlist.length} of {MAX_WATCHLIST} airports watched
      </span>
    </span>
  );

  return (
    <>
      <div role="status" className="signin-flash">
        {flash !== null ? (
          <div className="signin-flash__row">
            <Banner variant="success">
              {flash.email !== null ? `Successfully signed in as ${flash.email}.` : "Successfully signed in."}
            </Banner>
            <Button variant="ghost" aria-label="Dismiss sign-in message" onClick={() => setFlash(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}
      </div>
      <PageHeader title="Your watchlist" action={counter} />
      <ErrorRegion message={error} />
      {loading ? (
        <LoadingState text="Loading your watchlist…" />
      ) : watchlist.length === 0 ? (
        <EmptyState text="You are not watching any airports yet." />
      ) : null}
      {airports.length > 0 ? (
        <WatchlistTable
          airports={airports}
          watchlist={watchlist}
          disabled={busy || loading}
          onAdd={(id) => void add(id)}
          onRemove={(id) => void remove(id)}
        />
      ) : null}
    </>
  );
}
