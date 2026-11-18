// Deploy guard. Every job in deploy-workers.yml that deploys a Worker must only run on main.
// Validates Requirements 6.7, 6.8.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = resolve(ROOT, ".github", "workflows", "deploy-workers.yml");
const GUARD = "if: github.ref == 'refs/heads/main'";

/** Split the `jobs:` section into per-job blocks (2-space-indented keys). */
function jobBlocks(text: string): Map<string, string[]> {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const jobs = new Map<string, string[]>();
  if (start === -1) return jobs;
  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // next top-level key
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) {
      current = m[1] as string;
      jobs.set(current, []);
    } else if (current) {
      jobs.get(current)?.push(line);
    }
  }
  return jobs;
}

describe("deploy-workers.yml guard", () => {
  const text = readFileSync(WORKFLOW, "utf8");
  const jobs = jobBlocks(text);

  it("defines at least one job", () => {
    expect(jobs.size).toBeGreaterThan(0);
  });

  it("every job that deploys has the main-only guard as a job-level key", () => {
    const deploying = [...jobs].filter(([, body]) =>
      body.some((l) => l.includes("cloudflare/wrangler-action")),
    );
    expect(deploying.length).toBeGreaterThan(0);
    for (const [name, body] of deploying) {
      const guarded = body.some((l) => l === `    ${GUARD}`);
      expect(guarded, `job "${name}" lacks ${GUARD}`).toBe(true);
    }
  });
});
