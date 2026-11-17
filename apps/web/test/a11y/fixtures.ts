import { vi } from "vitest";
import type { AirportSummary, NationalStatusResponse } from "../../src/api/client";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Capture time used by every status fixture. */
export const CAPTURED_AT = "2026-01-02T12:00:00.000Z";

export const AIRPORTS: AirportSummary[] = [
  { airportId: "JFK", name: "New York JFK", groundStop: { reasonText: "Thunderstorms" } },
  { airportId: "ATL", name: "Atlanta Hartsfield-Jackson", groundStop: null },
  { airportId: "ORD", name: "Chicago O'Hare", groundStop: null },
];

export const NO_DATA: NationalStatusResponse = {
  state: "no_data",
  message: "No data yet. The first FAA check has not completed.",
};

type OkOptions = { stale?: boolean; nationwide?: boolean };

export function okStatus({ stale = false, nationwide = false }: OkOptions = {}): NationalStatusResponse {
  return {
    state: "ok",
    capturedAt: CAPTURED_AT,
    stale,
    airports: AIRPORTS,
    nationwide: nationwide
      ? { active: true, count: 3, artccs: ["ZNY", "ZDC", "ZBW"], explanation: "Ground stops are active at several airports." }
      : { active: false, count: 0, artccs: [], explanation: null },
    events: [],
  };
}

export const NORMAL = okStatus();
export const STALE = okStatus({ stale: true });
export const SYSTEM_WIDE = okStatus({ nationwide: true });

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

/** Maps "METHOD /path" to a response factory (a new Response per call; bodies are single-use). */
export type Routes = Record<string, () => Response>;

/** Stubs global fetch with a typed mock that answers from `routes`. Unmatched requests fail the test. */
export function stubFetch(routes: Routes): ReturnType<typeof vi.fn<FetchFn>> {
  const fetchMock = vi.fn<FetchFn>((input, init) => {
    const method = init?.method ?? "GET";
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const route = routes[`${method} ${url}`];
    if (route === undefined) return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    return Promise.resolve(route());
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
