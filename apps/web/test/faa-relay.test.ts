import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRelayHandler, type RelayFetch } from "../api/internal/faa-relay";

const FAA_URL = "https://nasstatus.faa.gov/api/airport-events";
const SECRET = "s3cr3t-relay-key-0123456789-abcdefghij";
const KEY_HEADER = "x-aerobrief-relay-key";

let logSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  logSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(
  response: () => Promise<Response>,
  secret: string | undefined | null = SECRET,
): { handler: (r: Request) => Promise<Response>; fetchFn: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn(response);
  const handler = createRelayHandler({
    env: { FAA_RELAY_SECRET: secret ?? undefined },
    fetchFn: fetchFn as unknown as RelayFetch,
  });
  return { handler, fetchFn };
}

function req(method = "GET", key: string | null = SECRET): Request {
  const headers: Record<string, string> = {};
  if (key !== null) headers[KEY_HEADER] = key;
  return new Request("https://example.test/api/internal/faa-relay", { method, headers });
}

function loggedText(): string {
  return logSpies.map((s) => JSON.stringify(s.mock.calls)).join("\n");
}

async function expectNoLeak(res: Response, body: string): Promise<void> {
  const headers = JSON.stringify([...res.headers.entries()]);
  for (const text of [body, headers, loggedText()]) {
    expect(text).not.toContain(SECRET);
  }
}

describe("faa-relay handler", () => {
  it("returns 401 with no fetch when the key is missing", async () => {
    const { handler, fetchFn } = setup(async () => new Response("{}"));
    const res = await handler(req("GET", null));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 401 with no fetch when the key is wrong", async () => {
    const { handler, fetchFn } = setup(async () => new Response("{}"));
    const res = await handler(req("GET", SECRET + "x"));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchFn).not.toHaveBeenCalled();
    await expectNoLeak(res, await res.text());
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("returns 405 for %s with no fetch", async (method) => {
    const { handler, fetchFn } = setup(async () => new Response("{}"));
    const res = await handler(req(method));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([null, "", "short-secret"])("returns 500 relay_misconfigured for secret %j", async (secret) => {
    const { handler, fetchFn } = setup(async () => new Response("{}"), secret);
    const res = await handler(req("GET", secret === null ? "anything" : secret));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "relay_misconfigured" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes a 2xx FAA body through unchanged as application/json", async () => {
    const body = '{"a": [1,  2],\n "b":"x"}';
    const { handler, fetchFn } = setup(async () => new Response(body, { status: 200 }));
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = await res.text();
    expect(text).toBe(body);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(FAA_URL);
    await expectNoLeak(res, text);
  });

  it("keeps a non-2xx status with a text excerpt of at most 300 characters", async () => {
    const { handler } = setup(async () => new Response("x".repeat(1000), { status: 403 }));
    const res = await handler(req());
    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.text()).length).toBeLessThanOrEqual(300);
  });

  it("returns 504 on timeout", async () => {
    const { handler } = setup(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    const res = await handler(req());
    expect(res.status).toBe(504);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "upstream_timeout" });
  });

  it("returns 502 on a network error", async () => {
    const { handler } = setup(async () => {
      throw new TypeError("fetch failed");
    });
    const res = await handler(req());
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = await res.text();
    expect(JSON.parse(json)).toEqual({ error: "upstream_unreachable" });
    await expectNoLeak(res, json);
  });

  it("returns 502 upstream_too_large when the body exceeds the cap", async () => {
    const { handler } = setup(async () => new Response("y".repeat(1_048_576 + 1), { status: 200 }));
    const res = await handler(req());
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "upstream_too_large" });
  });

  it("calls fetch only with the fixed FAA URL and fixed headers", async () => {
    const { handler, fetchFn } = setup(async () => new Response("{}"));
    const request = new Request("https://example.test/api/internal/faa-relay/extra?url=https://evil.test", {
      headers: { [KEY_HEADER]: SECRET, Authorization: "Bearer caller", Cookie: "a=b" },
    });
    await handler(request);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe(FAA_URL);
    const names = Object.keys(init.headers).map((n) => n.toLowerCase());
    expect(names).not.toContain(KEY_HEADER);
    expect(names).not.toContain("authorization");
    expect(names).not.toContain("cookie");
  });

  it("never writes the secret to the console", async () => {
    const outcomes: Array<() => Promise<Response>> = [
      async () => new Response("{}"),
      async () => new Response("denied", { status: 403 }),
      async () => {
        throw new TypeError("fetch failed");
      },
    ];
    for (const outcome of outcomes) {
      const { handler } = setup(outcome);
      await handler(req());
      await handler(req("GET", "wrong"));
      await handler(req("POST"));
    }
    expect(loggedText().length).toBeGreaterThan(0);
    expect(loggedText()).not.toContain(SECRET);
  });
});
