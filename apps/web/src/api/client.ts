/**
 * Browser-side API client. Response types mirror `NationalStatusResponse` and
 * `AirportStatusResponse` in design.md (and apps/api/src/handlers/status.ts). They are
 * redeclared here on purpose: the web app never imports apps/api or packages/db.
 */

export const REQUEST_TIMEOUT_MS = 10_000;

export type AirportSummary = {
  airportId: string;
  name: string;
  groundStop: {
    reasonText: string;
    /** ISO 8601 UTC. Absent from older API responses; `fetchNationalStatus` normalizes to null. */
    expectedEnd?: string | null;
    advisoryUrl?: string | null;
  } | null;
};

export type EventSummary = {
  type: string;
  airportId: string | null;
  occurredAt: string;
  explanation: string;
};

export type NationalStatusResponse =
  | { state: "no_data"; message: string }
  | {
      state: "ok";
      capturedAt: string;
      stale: boolean;
      airports: AirportSummary[];
      nationwide: { active: boolean; count: number; artccs: string[]; explanation: string | null };
      events: EventSummary[];
    };

export type AirportStatusResponse =
  | { state: "no_data"; message: string }
  | {
      state: "ok";
      capturedAt: string;
      stale: boolean;
      airport: AirportSummary;
      events: EventSummary[];
    };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAirportSummary(value: unknown): value is AirportSummary {
  if (!isRecord(value)) return false;
  const stop = value["groundStop"];
  return (
    typeof value["airportId"] === "string" &&
    typeof value["name"] === "string" &&
    (stop === null ||
      (isRecord(stop) &&
        typeof stop["reasonText"] === "string" &&
        isOptionalString(stop["expectedEnd"]) &&
        isOptionalString(stop["advisoryUrl"])))
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function normalizeAirport(a: AirportSummary): AirportSummary {
  if (a.groundStop === null) return a;
  return {
    ...a,
    groundStop: {
      reasonText: a.groundStop.reasonText,
      expectedEnd: a.groundStop.expectedEnd ?? null,
      advisoryUrl: a.groundStop.advisoryUrl ?? null,
    },
  };
}

/** Fills missing `expectedEnd` / `advisoryUrl` with null so callers can rely on `string | null`. */
export function normalizeNationalStatus(body: NationalStatusResponse): NationalStatusResponse {
  return body.state === "ok" ? { ...body, airports: body.airports.map(normalizeAirport) } : body;
}

function isEventSummary(value: unknown): value is EventSummary {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    (value["airportId"] === null || typeof value["airportId"] === "string") &&
    typeof value["occurredAt"] === "string" &&
    typeof value["explanation"] === "string"
  );
}

function isNationwide(value: unknown): value is { active: boolean; count: number; artccs: string[]; explanation: string | null } {
  return (
    isRecord(value) &&
    typeof value["active"] === "boolean" &&
    typeof value["count"] === "number" &&
    Array.isArray(value["artccs"]) &&
    value["artccs"].every((a) => typeof a === "string") &&
    (value["explanation"] === null || typeof value["explanation"] === "string")
  );
}

/** Runtime check that an untrusted JSON body is a `NationalStatusResponse`. */
export function isNationalStatusResponse(value: unknown): value is NationalStatusResponse {
  if (!isRecord(value)) return false;
  if (value["state"] === "no_data") return typeof value["message"] === "string";
  return (
    value["state"] === "ok" &&
    typeof value["capturedAt"] === "string" &&
    typeof value["stale"] === "boolean" &&
    Array.isArray(value["airports"]) &&
    value["airports"].every(isAirportSummary) &&
    isNationwide(value["nationwide"]) &&
    Array.isArray(value["events"]) &&
    value["events"].every(isEventSummary)
  );
}

/** Aborts when either signal aborts. */
function anySignal(a: AbortSignal, b: AbortSignal | undefined): AbortSignal {
  return b === undefined ? a : AbortSignal.any([a, b]);
}

/**
 * GET /api/status/national. Aborts after 10 s, or earlier if `signal` aborts.
 * Rejects with `ApiRequestError` on a non-2xx status or a malformed body.
 */
export async function fetchNationalStatus(signal?: AbortSignal): Promise<NationalStatusResponse> {
  const combined = anySignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal);
  const response = await fetch("/api/status/national", {
    headers: { Accept: "application/json" },
    signal: combined,
  });
  if (!response.ok) {
    throw new ApiRequestError(`Status request failed with HTTP ${response.status}.`, response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError("Status response was not valid JSON.", response.status);
  }
  if (!isNationalStatusResponse(body)) {
    throw new ApiRequestError("Status response had an unexpected shape.", response.status);
  }
  return normalizeNationalStatus(body);
}

function isAirportStatusResponse(value: unknown): value is AirportStatusResponse {
  if (!isRecord(value)) return false;
  if (value["state"] === "no_data") return typeof value["message"] === "string";
  return (
    value["state"] === "ok" &&
    typeof value["capturedAt"] === "string" &&
    typeof value["stale"] === "boolean" &&
    isAirportSummary(value["airport"]) &&
    Array.isArray(value["events"]) &&
    value["events"].every(isEventSummary)
  );
}

async function getJson(path: string, signal: AbortSignal | undefined): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    signal: anySignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal),
  });
  if (!response.ok) {
    throw new ApiRequestError(`Request failed with HTTP ${response.status}.`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new ApiRequestError("Response was not valid JSON.", response.status);
  }
}

/**
 * GET /api/status/airport/:code. `expectedEnd` and `advisoryUrl` are normalized to `string | null`.
 * Rejects with `ApiRequestError` (status 404 for an unmonitored airport).
 */
export async function fetchAirportStatus(code: string, signal?: AbortSignal): Promise<AirportStatusResponse> {
  const body = await getJson(`/api/status/airport/${encodeURIComponent(code)}`, signal);
  if (!isAirportStatusResponse(body)) {
    throw new ApiRequestError("Airport status response had an unexpected shape.", 200);
  }
  return body.state === "ok" ? { ...body, airport: normalizeAirport(body.airport) } : body;
}

/** GET /api/history/:code. Events for one airport within the last 24 h, newest first. */
export async function fetchAirportHistory(code: string, signal?: AbortSignal): Promise<EventSummary[]> {
  const body = await getJson(`/api/history/${encodeURIComponent(code)}`, signal);
  if (!isRecord(body) || !Array.isArray(body["events"]) || !body["events"].every(isEventSummary)) {
    throw new ApiRequestError("History response had an unexpected shape.", 200);
  }
  return body["events"];
}
