import type { AirportSummary } from "../api/client";
import { FAA_STATUS_URL, GroundStopDetails, type ActiveGroundStop } from "./GroundStopDetails";
import { AirportStatusPill } from "./AirportStatusPill";
import { StatusPill } from "./StatusPill";

export { FAA_STATUS_URL };

export interface AirportTableProps {
  airports: readonly AirportSummary[];
  /** Airport ids whose ground stop ended recently. Shown as "Recovering" instead of "Operating normally". */
  recoveringIds?: ReadonlySet<string>;
}

const NO_RECOVERING: ReadonlySet<string> = new Set();

/**
 * `fetchNationalStatus` always sets `expectedEnd` and `advisoryUrl` (null when unknown), so every
 * response from the API shows details. A bare `{ reasonText }` has neither key and shows the pill only.
 */
function hasDetails(stop: ActiveGroundStop): boolean {
  return stop.expectedEnd !== undefined || stop.advisoryUrl !== undefined;
}

export function AirportTable({ airports, recoveringIds = NO_RECOVERING }: AirportTableProps) {
  return (
    <table className="airport-table airport-table--status">
      <caption>Ground stop status by airport</caption>
      <thead>
        <tr>
          <th scope="col">Airport</th>
          <th scope="col">Name</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {airports.map((airport) => (
          <tr key={airport.airportId}>
            <th scope="row">
              <a href={`/airport/${airport.airportId}`}>{airport.airportId}</a>
            </th>
            <td className="airport-table__name">{airport.name}</td>
            <td>
              {airport.groundStop !== null ? (
                <>
                  <StatusPill variant="active" text="Ground stop" />
                  {hasDetails(airport.groundStop) ? <GroundStopDetails stop={airport.groundStop} airportId={airport.airportId} /> : null}
                </>
              ) : (
                recoveringIds.has(airport.airportId) ? (
                  <AirportStatusPill kind="recovering" />
                ) : (
                  <StatusPill variant="normal" text="Operating normally" />
                )
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
