import { describe, expect, it } from "vitest";
import { BODY_LIMIT, FAA_URL, probe } from "../src/index";

describe("faa-probe", () => {
  it("calls only the FAA URL, three variants, with the expected headers", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const results = await probe(async (url, init) => {
      calls.push({ url, headers: init.headers });
      return new Response("x".repeat(1000), {
        status: 403,
        headers: { server: "AkamaiGHost", "x-akamai-request-id": "1", "set-cookie": "secret", "x-other": "no" },
      });
    });
    expect(calls.map((c) => c.url)).toEqual([FAA_URL, FAA_URL, FAA_URL]);
    expect(calls[0]!.headers).toEqual({});
    expect(calls[1]!.headers).toEqual({
      "User-Agent": "AeroBrief/1.0 (+https://www.aerobriefs.com)",
      Accept: "application/json",
    });
    expect(calls[2]!.headers["User-Agent"]).toMatch(/^Mozilla\//);
    const first = results[0]!;
    if (!first.ok) throw new Error("expected ok");
    expect(first.status).toBe(403);
    expect(first.body).toHaveLength(BODY_LIMIT);
    expect(Object.keys(first.headers).sort()).toEqual(["content-type", "server", "x-akamai-request-id"]);
  });

  it("captures errors instead of throwing", async () => {
    const results = await probe(async () => {
      throw new TypeError("boom");
    });
    expect(results).toHaveLength(3);
    expect(results.every((r) => !r.ok)).toBe(true);
  });
});
