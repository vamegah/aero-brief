import { useEffect, useMemo, useRef, useState } from "react";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorRegion } from "../components/ErrorRegion";
import { LoadingState } from "../components/LoadingState";
import { MergeOffer } from "../components/MergeOffer";
import { PageHeader } from "../components/PageHeader";
import { SignedOutWatchlist } from "../components/SignedOutWatchlist";
import { WatchlistTable } from "../components/WatchlistTable";
import { airportStatusById } from "../lib/airport-status-by-id";
import { sortBySeverity } from "../lib/local-watchlist";
import { buildWatchedViews } from "../lib/watchlist-view";
import { useStatus } from "../hooks/use-status";
import { useWatchlist } from "../hooks/use-watchlist";
import { consumeSigninFlash, type SigninFlash } from "../lib/signin-flash";

const MAX_WATCHLIST = 30;

export function WatchlistPage() {
  const { status, events } = useStatus();
  const { watchlist, loading, unauthorized, error, busy, add, remove, replaceList } = useWatchlist();
  const [flash, setFlash] = useState<SigninFlash | null>(null);
  // Read the flag once (StrictMode runs effects twice). State is set after mount so the text is
  // inserted into the live region that already exists, which is what screen readers announce.
  const flashRead = useRef(false);
  useEffect(() => {
    if (flashRead.current) return;
    flashRead.current = true;
    setFlash(consumeSigninFlash());
  }, []);

  const rawAirports = status !== null && status.state === "ok" ? status.airports : [];
  // Watched airports first, most severe first (Requirement 4.5); the rest keep their order.
  const airports = useMemo(() => {
    const views = buildWatchedViews(watchlist, status, events, new Date());
    const kinds = new Map(views.map((v) => [v.airportId as string, v.kind]));
    const watchedIds = sortBySeverity(
      views.map((v) => v.airportId),
      (id) => kinds.get(id) ?? "normal",
    );
    const rank = new Map(watchedIds.map((id, i) => [id as string, i]));
    const watched = rawAirports
      .filter((a) => rank.has(a.airportId))
      .sort((a, b) => (rank.get(a.airportId) ?? 0) - (rank.get(b.airportId) ?? 0));
    return [...watched, ...rawAirports.filter((a) => !rank.has(a.airportId))];
  }, [rawAirports, watchlist, status, events]);

  const statusById = useMemo(
    () =>
      status !== null && status.state === "ok"
        ? airportStatusById({ airports: status.airports, events, hasData: true, now: new Date() })
        : undefined,
    [status, events],
  );

  if (unauthorized) return <SignedOutWatchlist status={status} events={events} />;

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
      <div role="status" className="merge-offer">
        {loading ? null : <MergeOffer account={watchlist} onMerged={replaceList} />}
      </div>
      <ErrorRegion message={error} />
      {loading ? (
        <LoadingState text="Loading your watchlist…" />
      ) : watchlist.length === 0 ? (
        <EmptyState text="You are not watching any airports yet." />
      ) : null}
      {airports.length > 0 && watchlist.length > 0 ? (
        <p className="form__hint">Your airports are listed first, most severe status first.</p>
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
