import type { Incident } from "@aerobrief/core/incidents";
import type { IncidentFeed } from "../lib/incident-feed";
import { EventCard } from "./EventCard";
import { IncidentCard, type IncidentRecovery } from "./IncidentCard";

export interface IncidentListProps {
  /** Incidents already sorted (active first, then most recent end) and any events of other types. */
  feed: IncidentFeed;
  now?: Date;
  /** Reason and expected end of the active ground stop at an airport, keyed by airport code. */
  activeStops?: ReadonlyMap<string, { reason: string | null; expectedEnd: string | null }>;
  /** Recovery detail keyed by incident key. */
  recovery?: ReadonlyMap<string, IncidentRecovery>;
}

function stopFor(incident: Incident, stops: IncidentListProps["activeStops"]) {
  if (incident.endedAt !== null || incident.airportId === null) return undefined;
  return stops?.get(incident.airportId);
}

/** The list of incident cards. Unrecognized event types fall back to `EventCard`. Renders nothing when empty. */
export function IncidentList({ feed, now, activeStops, recovery }: IncidentListProps) {
  return (
    <ul className="event-list incident-list">
      {feed.incidents.map((incident) => {
        const stop = stopFor(incident, activeStops);
        const detail = recovery?.get(incident.incidentKey);
        return (
          <li key={incident.incidentKey}>
            <IncidentCard
              incident={incident}
              {...(now !== undefined ? { now } : {})}
              {...(stop !== undefined ? { reason: stop.reason, expectedEnd: stop.expectedEnd } : {})}
              {...(detail !== undefined ? { recovery: detail } : {})}
            />
          </li>
        );
      })}
      {feed.others.map((event, index) => (
        <li key={`other-${event.incidentKey}-${index}`}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}
