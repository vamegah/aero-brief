// Import rules for @aerobrief/webhook-sender (Req 7.3, 14.5): apps/web and packages/core must never import it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", "dist", ".wrangler", ".git"]);
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IMPORT = /@aerobrief\/webhook-sender|packages\/webhook-sender/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && SOURCE.test(entry.name)) out.push(full);
  }
  return out;
}

function offenders(rel: string): string[] {
  return walk(join(ROOT, rel)).filter((file) => IMPORT.test(readFileSync(file, "utf8")));
}

describe("webhook-sender import rules", () => {
  it("apps/web does not import @aerobrief/webhook-sender", () => {
    expect(offenders("apps/web")).toEqual([]);
  });
  it("packages/core does not import @aerobrief/webhook-sender", () => {
    expect(offenders("packages/core")).toEqual([]);
  });
});
