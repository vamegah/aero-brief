import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRelayHandler, type RelayFetch } from "../api/internal/faa-relay";

const FAA_URL = "https://nasstatus.faa.gov/api/airport-events";
const KEY_HEADER = "x-aerobrief-relay-key";

const alnum = (min: number, max: number) =>
  fc.string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"), minLength: min, maxLength: max });

const secretArb = alnum(32, 64);
const methodArb = fc.constantFrom("GET", "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS");
const headersArb = fc.dictionary(
  alnum(1, 12).map((n) => `x-${n}`),
  alnum(0, 20),
  { maxKeys: 5 },
);

let logSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  logSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function windows(secret: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 8 <= secret.length; i++) out.push(secret.slice(i, i + 8));
  return out;
}

describe("faa-relay handler properties", () => {
  /**
   * Feature: faa-403-poller, Property 4: Relay is not an open proxy
   * **Validates: Requirements 1.3, 2.3**
   */
  it("fetches at most once, only the FAA URL, only for GET with the right key", async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        methodArb,
        alnum(0, 20),
        alnum(0, 20),
        headersArb,
        fc.option(alnum(0, 40), { nil: undefined }),
        fc.boolean(),
        alnum(0, 40),
        async (secret, method, path, query, headers, body, useRightKey, wrongKey) => {
          const key = useRightKey ? secret : wrongKey;
          const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
          const handler = createRelayHandler({
            env: { FAA_RELAY_SECRET: secret },
            fetchFn: fetchFn as unknown as RelayFetch,
          });
          const allHeaders: Record<string, string> = { ...headers, [KEY_HEADER]: key };
          const request = new Request(`https://example.test/api/internal/faa-relay/${path}?${query}`, {
            method,
            headers: allHeaders,
            ...(method !== "GET" && body !== undefined ? { body } : {}),
          });
          const res = await handler(request);

          const shouldFetch = method === "GET" && key === secret;
          expect(fetchFn.mock.calls.length).toBe(shouldFetch ? 1 : 0);
          if (shouldFetch) {
            const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
            expect(url).toBe(FAA_URL);
            const sent = Object.keys(init.headers).map((n) => n.toLowerCase());
            for (const name of Object.keys(headers)) expect(sent).not.toContain(name.toLowerCase());
            expect(sent).not.toContain(KEY_HEADER);
            expect(res.status).toBe(200);
          } else if (method !== "GET") {
            expect(res.status).toBe(405);
          } else {
            expect(res.status).toBe(401);
          }
          expect(res.headers.get("Cache-Control")).toBe("no-store");
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Feature: faa-403-poller, Property 6: The secret never leaks (relay side)
   * **Validates: Requirements 2.4, 2.5, 3.1**
   */
  it("never exposes the secret or an 8-character piece of it in responses or logs", async () => {
    const outcomeArb = fc.constantFrom("ok", "403", "network", "timeout", "too-large");
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        methodArb,
        fc.boolean(),
        alnum(0, 40),
        outcomeArb,
        async (secret, method, useRightKey, wrongKey, outcome) => {
          for (const spy of logSpies) spy.mockClear();
          const fetchFn = vi.fn(async () => {
            switch (outcome) {
              case "ok":
                return new Response('{"events":[]}', { status: 200 });
              case "403":
                return new Response("Forbidden", { status: 403 });
              case "too-large":
                return new Response("z".repeat(1_048_576 + 1), { status: 200 });
              case "timeout":
                throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
              default:
                throw new TypeError("fetch failed");
            }
          });
          const handler = createRelayHandler({
            env: { FAA_RELAY_SECRET: secret },
            fetchFn: fetchFn as unknown as RelayFetch,
          });
          const res = await handler(
            new Request("https://example.test/api/internal/faa-relay", {
              method,
              headers: { [KEY_HEADER]: useRightKey ? secret : wrongKey },
            }),
          );
          const haystack = [
            await res.text(),
            JSON.stringify([...res.headers.entries()]),
            logSpies.map((s) => JSON.stringify(s.mock.calls)).join("\n"),
          ].join("\n");
          for (const piece of windows(secret)) expect(haystack).not.toContain(piece);
        },
      ),
      { numRuns: 100 },
    );
  });
});
