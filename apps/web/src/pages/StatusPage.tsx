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

  return (
    <>
      <PageHeader title="National status" subtitle="FAA ground stop status for 30 major US airports." />
      <ErrorRegion message={message} />
      <StatusView status={status} events={events} loading={loading} />
    </>
  );
}
