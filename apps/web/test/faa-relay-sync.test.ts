// The relay function is self-contained (Vercel does not compile workspace TypeScript).
// This test fails when its constants or its decisions drift from packages/core/src/faa-relay.ts.
import {
  RELAY_ERROR_BODY_CHARS,
  RELAY_KEY_HEADER,
  RELAY_MAX_BODY_BYTES,
  RELAY_SECRET_MIN_LENGTH,
  RELAY_TARGET_URL,
  RELAY_TIMEOUT_MS,
  decideRelayRequest,
  shapeRelayResponse,
} from "@aerobrief/core/faa-relay";
import { describe, expect, it } from "vitest";
import { createRelayHandler } from "../api/internal/faa-relay";
import source from "../api/internal/faa-relay.ts?raw";

function constant(name: string): string {
  const match = new RegExp(`const ${name} = ([^;]+);`).exec(source);
  if (!match?.[1]) throw new Error(`constant ${name} not found`);
  return match[1].replace(/_/g, "").replace(/^"|"$/g, "");
}

describe("faa-relay copy matches packages/core", () => {
  it("has the same constants", () => {
    expect(constant("KEY_HEADER")).toBe(RELAY_KEY_HEADER);
    expect(constant("TARGET_URL")).toBe(RELAY_TARGET_URL);
    expect(Number(constant("SECRET_MIN_LENGTH"))).toBe(RELAY_SECRET_MIN_LENGTH);
    expect(Number(constant("TIMEOUT_MS"))).toBe(RELAY_TIMEOUT_MS);
    expect(Number(constant("MAX_BODY_BYTES"))).toBe(RELAY_MAX_BODY_BYTES);
    expect(Number(constant("ERROR_BODY_CHARS"))).toBe(RELAY_ERROR_BODY_CHARS);
  });

  it("makes the same accept/reject decision and status shaping as core", async () => {
    const secret = "s".repeat(RELAY_SECRET_MIN_LENGTH);
    const cases: Array<{ method: string; key: string | null; secret: string | undefined }> = [
      { method: "GET", key: secret, secret },
      { method: "GET", key: null, secret },
      { method: "GET", key: "x".repeat(32), secret },
      { method: "POST", key: secret, secret },
      { method: "GET", key: secret, secret: "short" },
      { method: "GET", key: secret, secret: undefined },
    ];
    for (const c of cases) {
      let calls = 0;
      const handler = createRelayHandler({
        env: { FAA_RELAY_SECRET: c.secret },
        fetchFn: async () => {
          calls++;
          return new Response("x".repeat(500), { status: 403 });
        },
      });
      const headers = new Headers();
      if (c.key !== null) headers.set(RELAY_KEY_HEADER, c.key);
      const response = await handler(new Request("https://example.test/", { method: c.method, headers }));
      const decision = decideRelayRequest({ method: c.method, providedKey: c.key, secret: c.secret });
      if (decision.action === "reject") {
        expect(response.status).toBe(decision.status);
        expect(calls).toBe(0);
      } else {
        const shaped = shapeRelayResponse({ upstreamStatus: 403, bodyText: "x".repeat(500) });
        expect(calls).toBe(1);
        expect(response.status).toBe(shaped.status);
        expect(response.headers.get("content-type")).toBe(shaped.contentType);
        expect(await response.text()).toBe(shaped.body);
      }
    }
  });
});
