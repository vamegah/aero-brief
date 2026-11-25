import { FreshnessChip } from "../components/FreshnessChip";
import { deriveFreshness } from "../lib/freshness";
import { ErrorRegion } from "../components/ErrorRegion";
import { PageHeader } from "../components/PageHeader";
import { StatusView } from "../components/StatusView";
import { useStatus } from "../hooks/use-status";

export const REFRESH_FAILED_TEXT =
  "Could not refresh the status. Showing the last data received. Retrying automatically.";

export function StatusPage() {
  const { status, events, loading, refreshFailed } = useStatus();
  const message = refreshFailed
    ? status === null
      ? "Could not load the status. Retrying automatically."
      : REFRESH_FAILED_TEXT
    : null;
  // Last known data stays on screen after a failed refresh (Delayed). Unavailable only when no
  // status ever loaded.
  const ok = status !== null && status.state === "ok" ? status : null;
  const freshness = deriveFreshness({ hasData: ok !== null, stale: ok?.stale ?? false, refreshFailed });
  const capturedAt = ok !== null ? ok.capturedAt : null;

  return (
    <>
      <PageHeader
        title="Airport status"
        subtitle="Ground stops and system-wide disruptions at 30 major US airports."
        action={<FreshnessChip freshness={freshness} capturedAt={capturedAt} loading={loading && status === null} />}
      />
      <ErrorRegion message={message} />
      <StatusView status={status} events={events} loading={loading} />
    </>
  );
}
