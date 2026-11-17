import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { idempotencyKey, sendEmail, type FetchFn } from "../src/index";

const message = { from: "a@b.test", to: "c@d.test", subject: "s", text: "t" };
const idem = { eventKey: "faa:1", eventType: "GROUND_STOP_STARTED", userId: "u1" };
const API_KEY = "re_secret_key_123";

function recorder(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    const next = responses[calls.length - 1] ?? new Response("{}", { status: 500 });
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchFn };
}

function makeSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}

const ok = () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 });

describe("idempotencyKey", () => {
  it("is sha256 hex of event_key:event_type:user_id", async () => {
    const expected = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode("faa:1:GROUND_STOP_STARTED:u1")),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    expect(await idempotencyKey(idem)).toBe(expected);
    expect(expected).toHaveLength(64);
  });
});

describe("sendEmail", () => {
  it("posts to Resend with auth, Idempotency-Key and a 10 s timeout signal", async () => {
    const { calls, fetchFn } = recorder([ok()]);
    const { sleep } = makeSleep();
    const res = await sendEmail({ apiKey: API_KEY, message, idempotency: idem, fetch: fetchFn, sleep });
    expect(res).toMatchObject({ ok: true, id: "em_1", attempts: 1 });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(await idempotencyKey(idem));
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries 5xx with 1 s and 2 s backoff and reuses the same key", async () => {
    const { calls, fetchFn } = recorder([
      new Response("", { status: 503 }),
      new Error("boom"),
      ok(),
    ]);
    const { delays, sleep } = makeSleep();
    const res = await sendEmail({ apiKey: API_KEY, message, idempotency: idem, fetch: fetchFn, sleep });
    expect(res).toMatchObject({ ok: true, attempts: 3 });
    expect(delays).toEqual([1000, 2000]);
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("gives up after 3 attempts and reports failure without the API key", async () => {
    const { calls, fetchFn } = recorder([
      new Response("", { status: 500 }),
      new Response("", { status: 502 }),
      new Response("", { status: 503 }),
    ]);
    const { delays, sleep } = makeSleep();
    const res = await sendEmail({ apiKey: API_KEY, message, idempotency: idem, fetch: fetchFn, sleep });
    expect(calls).toHaveLength(3);
    expect(delays).toEqual([1000, 2000]);
    expect(res).toMatchObject({ ok: false, attempts: 3, status: 503 });
    expect(JSON.stringify(res)).not.toContain(API_KEY);
  });

  it("does not retry non-retryable 4xx", async () => {
    const { calls, fetchFn } = recorder([new Response("", { status: 422 })]);
    const { delays, sleep } = makeSleep();
    const res = await sendEmail({ apiKey: API_KEY, message, idempotency: idem, fetch: fetchFn, sleep });
    expect(calls).toHaveLength(1);
    expect(delays).toEqual([]);
    expect(res).toMatchObject({ ok: false, attempts: 1, status: 422 });
  });

  it("classifies timeouts", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const { fetchFn } = recorder([timeout, timeout, timeout]);
    const { sleep } = makeSleep();
    const res = await sendEmail({ apiKey: API_KEY, message, idempotency: idem, fetch: fetchFn, sleep });
    expect(res).toMatchObject({ ok: false, status: null, error: "timeout", attempts: 3 });
  });

  it("stops retrying when shouldRetry returns false", async () => {
    const { calls, fetchFn } = recorder([new Response("", { status: 500 })]);
    const { sleep } = makeSleep();
    const res = await sendEmail({
      apiKey: API_KEY,
      message,
      idempotency: idem,
      fetch: fetchFn,
      sleep,
      shouldRetry: () => false,
    });
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ ok: false, attempts: 1 });
  });
});

describe("idempotencyKey properties", () => {
  it("is deterministic per triple (Validates: Requirements 9.5)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), fc.string(), async (eventKey, eventType, userId) => {
        const a = await idempotencyKey({ eventKey, eventType, userId });
        const b = await idempotencyKey({ eventKey, eventType, userId });
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 50 },
    );
  });
});
