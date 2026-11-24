import { describe, expect, it } from "vitest";
import vercelRaw from "../vercel.json?raw";

interface Rewrite {
  source: string;
  destination: string;
}

interface VercelConfig {
  functions: Record<string, { maxDuration: number; regions: string[] }>;
  rewrites: Rewrite[];
}

const config = JSON.parse(vercelRaw) as VercelConfig;

// Validates: Requirements 2.7
describe("vercel.json rewrites", () => {
  it("serves /settings through the final catch-all to /index.html", () => {
    const last = config.rewrites[config.rewrites.length - 1];
    expect(last).toEqual({ source: "/(.*)", destination: "/index.html" });
    expect(config.rewrites.some((r) => r.source === "/settings")).toBe(false);
  });

  it("keeps the /api/:path* rewrite before the catch-all", () => {
    const apiIndex = config.rewrites.findIndex((r) => r.source === "/api/:path*");
    const catchAllIndex = config.rewrites.findIndex((r) => r.source === "/(.*)");
    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(apiIndex).toBeLessThan(catchAllIndex);
    expect(config.rewrites[apiIndex]?.destination).toBe(
      "https://aerobrief-api.vamegah.workers.dev/api/:path*",
    );
  });

  it("keeps the faa-relay function entry unchanged", () => {
    expect(config.functions["api/internal/faa-relay.ts"]).toEqual({
      maxDuration: 15,
      regions: ["iad1"],
    });
  });
});
