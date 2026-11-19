import { signWebhook } from "@aerobrief/core";
import { describe, expect, it } from "vitest";
import { sendWebhookOnce, type SenderFetch, type SenderRequestInit } from "../src/send";

const URL_OK = "https://hooks.example.com/in/abc";
const SECRET = "whsec_testsecret";
const BODY = JSON.stringify({ hello: "world" });

interface Call {
  url: string;
  init: SenderRequestInit;
}

function fakeFetch(respond: () => Promise<{ status: number; body?: { cancel(): unknown } | null }>) {
  const calls: Call[] = [];
  const fetch: SenderFetch = (url, init) => {
    calls.push({ url, init });
    return respond();
  };
  return { fetch, calls };
}

const clock = (ms: number) => () => new Date(ms);

describe("sendWebhookOnce", () => {
  it("posts with manual redirect, a timeout signal and all headers", async () => {
    const { fetch, calls } = fakeFetch(async () => ({ status: 204 }));
    const result = await sendWebhookOnce({
      fetch,
      url: URL_OK,
      secret: SECRET,
      deliveryId: "d-1",
      body: BODY,
      now: clock(1_700_000_000_500),
    });
    expect(result).toEqual({ status: 204 });
    const call = calls[0]!;
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("manual");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(call.init.body).toBe(BODY);
    expect(call.init.headers["Content-Type"]).toBe("application/json");
    expect(call.init.headers["X-AeroBrief-Delivery"]).toBe("d-1");
    expect(call.init.headers["X-AeroBrief-Timestamp"]).toBe("1700000000");
    expect(call.init.headers["X-AeroBrief-Signature"]).toBe(await signWebhook(SECRET, 1_700_000_000, BODY));
    expect(call.init.headers["X-AeroBrief-Signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("returns a 3xx status as is and does not follow it", async () => {
    const { fetch, calls } = fakeFetch(async () => ({ status: 302 }));
    const result = await sendWebhookOnce({
      fetch,
      url: URL_OK,
      secret: SECRET,
      deliveryId: "d",
      body: BODY,
      now: clock(0),
    });
    expect(result).toEqual({ status: 302 });
    expect(calls).toHaveLength(1);
  });

  it("cancels the response body unread, and survives a failing cancel", async () => {
    let cancelled = 0;
    const ok = fakeFetch(async () => ({ status: 200, body: { cancel: () => void cancelled++ } }));
    await sendWebhookOnce({ fetch: ok.fetch, url: URL_OK, secret: SECRET, deliveryId: "d", body: BODY, now: clock(0) });
    expect(cancelled).toBe(1);

    const bad = fakeFetch(async () => ({
      status: 500,
      body: { cancel: () => Promise.reject(new Error("boom")) },
    }));
    const result = await sendWebhookOnce({
      fetch: bad.fetch,
      url: URL_OK,
      secret: SECRET,
      deliveryId: "d",
      body: BODY,
      now: clock(0),
    });
    expect(result).toEqual({ status: 500 });
  });

  it("maps timeout and abort errors to timeout, others to network", async () => {
    const run = (err: unknown) =>
      sendWebhookOnce({
        fetch: fakeFetch(() => Promise.reject(err)).fetch,
        url: URL_OK,
        secret: SECRET,
        deliveryId: "d",
        body: BODY,
        now: clock(0),
      });
    expect(await run(new DOMException("t", "TimeoutError"))).toEqual({ errorKind: "timeout" });
    expect(await run(new DOMException("a", "AbortError"))).toEqual({ errorKind: "timeout" });
    expect(await run(new TypeError("fetch failed"))).toEqual({ errorKind: "network" });
  });

  it("uses a new timestamp and signature per attempt with the same Delivery_ID", async () => {
    const { fetch, calls } = fakeFetch(async () => ({ status: 503 }));
    for (const ms of [1_700_000_000_000, 1_700_000_002_000]) {
      await sendWebhookOnce({ fetch, url: URL_OK, secret: SECRET, deliveryId: "same", body: BODY, now: clock(ms) });
    }
    const [a, b] = calls.map((c) => c.init.headers);
    expect(a!["X-AeroBrief-Delivery"]).toBe("same");
    expect(b!["X-AeroBrief-Delivery"]).toBe("same");
    expect(a!["X-AeroBrief-Timestamp"]).not.toBe(b!["X-AeroBrief-Timestamp"]);
    expect(a!["X-AeroBrief-Signature"]).not.toBe(b!["X-AeroBrief-Signature"]);
  });

  it("never contacts a stored unsafe URL", async () => {
    const { fetch, calls } = fakeFetch(async () => ({ status: 200 }));
    for (const url of ["http://hooks.example.com/x", "https://127.0.0.1/x", "https://localhost/x", "not a url"]) {
      const result = await sendWebhookOnce({ fetch, url, secret: SECRET, deliveryId: "d", body: BODY, now: clock(0) });
      expect(result).toEqual({ errorKind: "blocked_url" });
    }
    expect(calls).toHaveLength(0);
  });

  it("rejects a non-string or oversized body without contacting", async () => {
    const { fetch, calls } = fakeFetch(async () => ({ status: 200 }));
    const big = "x".repeat(4097);
    expect(
      await sendWebhookOnce({ fetch, url: URL_OK, secret: SECRET, deliveryId: "d", body: big, now: clock(0) }),
    ).toEqual({ errorKind: "invalid_payload" });
    expect(
      await sendWebhookOnce({
        fetch,
        url: URL_OK,
        secret: SECRET,
        deliveryId: "d",
        body: { a: 1 } as unknown as string,
        now: clock(0),
      }),
    ).toEqual({ errorKind: "invalid_payload" });
    expect(calls).toHaveLength(0);
  });

  it("returns and logs no URL, secret or response detail", async () => {
    const logged: unknown[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = (...a: unknown[]) => void logged.push(a);
    let text = "";
    try {
      const r1 = await sendWebhookOnce({
        fetch: fakeFetch(async () => ({ status: 200 })).fetch,
        url: URL_OK,
        secret: SECRET,
        deliveryId: "d",
        body: BODY,
        now: clock(0),
      });
      const r2 = await sendWebhookOnce({
        fetch: fakeFetch(() => Promise.reject(new Error(`${URL_OK} ${SECRET}`))).fetch,
        url: URL_OK,
        secret: SECRET,
        deliveryId: "d",
        body: BODY,
        now: clock(0),
      });
      text = JSON.stringify([r1, r2]);
    } finally {
      Object.assign(console, orig);
    }
    expect(text).not.toContain("hooks.example.com");
    expect(text).not.toContain(SECRET);
    expect(logged).toHaveLength(0);
  });
});
