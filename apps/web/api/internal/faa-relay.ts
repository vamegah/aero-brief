/// <reference path="../env.d.ts" />
// FAA relay (task 13.1 of .kiro/specs/faa-403-poller).
// Approved exception in .kiro/steering/tech.md: one function, one fixed upstream URL.
//
// SELF-CONTAINED ON PURPOSE. The logic mirrors packages/core/src/faa-relay.ts
// (constants, decideRelayRequest, shapeRelayResponse), but nothing is imported:
// Vercel does not compile the workspace TypeScript behind `@aerobrief/core/faa-relay`,
// and a second file under api/ would become a second function. The version 0 handler
// had no imports and ran on Preview. apps/web/test/faa-relay-sync.test.ts fails when
// this copy and the core module drift apart.

const KEY_HEADER = "x-aerobrief-relay-key";
const TARGET_URL = "https://nasstatus.faa.gov/api/airport-events";
const SECRET_MIN_LENGTH = 32;
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_048_576;
const ERROR_BODY_CHARS = 300;

export interface RelayEnv {
  FAA_RELAY_SECRET?: string | undefined;
}

export type RelayFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

export interface RelayDeps {
  env: RelayEnv;
  fetchFn: RelayFetch;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

function reply(status: number, body: string, contentType: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store", ...extra },
  });
}

function errorReply(status: number, error: string, extra: Record<string, string> = {}): Response {
  return reply(status, JSON.stringify({ error }), "application/json", extra);
}

class BodyTooLargeError extends Error {}

async function readCapped(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function createRelayHandler(deps: RelayDeps): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const secret = deps.env.FAA_RELAY_SECRET;
    if (typeof secret !== "string" || secret.length < SECRET_MIN_LENGTH) {
      console.error("relay_misconfigured");
      return errorReply(500, "relay_misconfigured");
    }
    if (request.method !== "GET") {
      console.warn("relay_method_not_allowed");
      return errorReply(405, "method_not_allowed", { Allow: "GET" });
    }
    const provided = request.headers.get(KEY_HEADER) ?? "";
    if (provided === "" || !timingSafeEqualStrings(provided, secret)) {
      console.warn("relay_unauthorized");
      return errorReply(401, "unauthorized");
    }

    // Constant URL and headers. Nothing from the incoming request is forwarded.
    let text: string;
    let upstreamStatus: number;
    try {
      const upstream = await deps.fetchFn(TARGET_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": "AeroBrief/1.0 (+https://www.aerobriefs.com)",
          Accept: "application/json",
        },
      });
      upstreamStatus = upstream.status;
      text = await readCapped(upstream);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        console.error("relay_upstream_too_large");
        return errorReply(502, "upstream_too_large");
      }
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      console.error(timedOut ? "relay_upstream_timeout" : "relay_upstream_unreachable");
      return errorReply(timedOut ? 504 : 502, timedOut ? "upstream_timeout" : "upstream_unreachable");
    }

    console.log(`relay_upstream_status ${upstreamStatus}`);
    if (upstreamStatus >= 200 && upstreamStatus <= 299) {
      const nullBody = upstreamStatus === 204 || upstreamStatus === 205;
      return new Response(nullBody ? null : text, {
        status: upstreamStatus,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return reply(upstreamStatus, text.slice(0, ERROR_BODY_CHARS), "text/plain");
  };
}

export default {
  fetch(request: Request): Promise<Response> {
    return createRelayHandler({
      env: { FAA_RELAY_SECRET: process.env.FAA_RELAY_SECRET },
      fetchFn: (url, init) => fetch(url, init),
    })(request);
  },
};
