import type { AirportSummary } from "../api/client";
import { FAA_STATUS_URL, GroundStopDetails, type ActiveGroundStop } from "./GroundStopDetails";
import { StatusPill } from "./StatusPill";

export { FAA_STATUS_URL };

export interface AirportTableProps {
  airports: readonly AirportSummary[];
}

/**
 * `fetchNationalStatus` always sets `expectedEnd` and `advisoryUrl` (null when unknown), so every
 * response from the API shows details. A bare `{ reasonText }` has neither key and shows the pill only.
 */
function hasDetails(stop: ActiveGroundStop): boolean {
  return stop.expectedEnd !== undefined || stop.advisoryUrl !== undefined;
}

export function AirportTable({ airports }: AirportTableProps) {
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
                  {hasDetails(airport.groundStop) ? <GroundStopDetails stop={airport.groundStop} /> : null}
                </>
              ) : (
                <StatusPill variant="normal" text="No ground stop reported" />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
