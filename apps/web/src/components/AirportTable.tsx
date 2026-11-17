import type { AirportSummary } from "../api/client";

export interface AirportTableProps {
  airports: readonly AirportSummary[];
}

export function AirportTable({ airports }: AirportTableProps) {
  return (
    <table className="airport-table">
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
            <th scope="row">{airport.airportId}</th>
            <td>{airport.name}</td>
            <td>
              {airport.groundStop !== null ? (
                <span className="status status--stop">Ground stop</span>
              ) : (
                <span className="status status--clear">No ground stop reported</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
