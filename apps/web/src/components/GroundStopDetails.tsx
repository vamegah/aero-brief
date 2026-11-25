import type { AirportSummary } from "../api/client";
import { TimeText } from "./TimeText";

export const FAA_STATUS_URL = "https://nasstatus.faa.gov";

export type ActiveGroundStop = NonNullable<AirportSummary["groundStop"]>;

/** Reason, expected end (or "Until further notice") and FAA link for one active ground stop. */
export function GroundStopDetails({ stop, airportId }: { stop: ActiveGroundStop; airportId?: string }) {
  const advisoryUrl = stop.advisoryUrl ?? null;
  const expectedEnd = stop.expectedEnd ?? null;
  return (
    <p className="airport-table__detail">
      <span>{stop.reasonText}</span>{" "}
      <span>
        {expectedEnd !== null ? (
          <>
            Expected to end around <TimeText iso={expectedEnd} airportId={airportId} />
          </>
        ) : (
          "Until further notice"
        )}
      </span>{" "}
      <a href={advisoryUrl ?? FAA_STATUS_URL} target="_blank" rel="noopener noreferrer">
        {advisoryUrl !== null ? "FAA advisory" : "FAA status page"}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
