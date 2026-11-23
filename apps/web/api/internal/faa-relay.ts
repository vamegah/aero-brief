// Relay probe, version 0 (task 10.1 of .kiro/specs/faa-403-poller).
// Version 0 only checks that Vercel's egress reaches the FAA (task 10.3); the full relay replaces it in task 13.1.
// Approved exception in .kiro/steering/tech.md: one function, one fixed upstream URL.
// Self-contained on purpose: no workspace imports, so a module-resolution problem
// cannot hide the egress result. Replaced by the full relay in task 13.

const FAA_URL = "https://nasstatus.faa.gov/api/airport-events";
const KEY_HEADER = "x-aerobrief-relay-key";
const SECRET_MIN_LENGTH = 32;
const TIMEOUT_MS = 10_000;
const SNIPPET_CHARS = 300;

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

// Compares every byte of the longer input; the length difference is mixed into the result.
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const secret = process.env.FAA_RELAY_SECRET;
    if (typeof secret !== "string" || secret.length < SECRET_MIN_LENGTH) {
      console.error("relay_misconfigured");
      return json(500, { error: "relay_misconfigured" });
    }
    if (request.method !== "GET") {
      console.warn("relay_method_not_allowed");
      return json(405, { error: "method_not_allowed" }, { Allow: "GET" });
    }
    const provided = request.headers.get(KEY_HEADER);
    if (provided === null || !constantTimeEqual(provided, secret)) {
      console.warn("relay_unauthorized");
      return json(401, { error: "unauthorized" });
    }

    let upstream: Response;
    try {
      upstream = await fetch(FAA_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": "AeroBrief/1.0 (+https://www.aerobriefs.com)",
          Accept: "application/json",
        },
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      console.error(timedOut ? "relay_upstream_timeout" : "relay_upstream_unreachable");
      return json(timedOut ? 504 : 502, {
        error: timedOut ? "upstream_timeout" : "upstream_unreachable",
      });
    }

    let text: string;
    try {
      text = await upstream.text();
    } catch {
      console.error("relay_upstream_unreachable");
      return json(502, { error: "upstream_unreachable" });
    }
    console.log(`relay_upstream_status ${upstream.status}`);
    return json(200, {
      upstreamStatus: upstream.status,
      bytes: new TextEncoder().encode(text).length,
      contentType: upstream.headers.get("content-type"),
      snippet: text.slice(0, SNIPPET_CHARS),
    });
  },
};
