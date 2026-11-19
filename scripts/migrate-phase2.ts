// CLI entry for Phase 2 migrations (Requirements 4.5, 4.6). Run: npm run migrate-phase2
// Node 24 runs this file directly (type stripping), so only erasable TypeScript syntax is used.
// Reads from the shell environment only (never .env): DATABASE_URL, PHASE2_DB_HOST, PRODUCTION_DB_HOST.
// The guard runs before any statement. Migrations are applied by the same drizzle-kit command as the MVP.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertPhase2Target, Phase2TargetError } from "../packages/db/src/phase2-target.ts";

// Walks up node_modules from `from`, as Node resolution does, because drizzle-kit does not export its bin.
function findDrizzleKitBin(from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const bin = join(dir, "node_modules", "drizzle-kit", "bin.cjs");
    if (existsSync(bin)) return bin;
    if (dirname(dir) === dir) return undefined;
  }
}
function main(): void {
  const env = process.env;
  try {
    assertPhase2Target(env.DATABASE_URL, env.PHASE2_DB_HOST, env.PRODUCTION_DB_HOST);
  } catch (e: unknown) {
    // Phase2TargetError messages hold host names only. Any other error: print the name only.
    const message = e instanceof Phase2TargetError ? e.message : `Unexpected error (${e instanceof Error ? e.name : "unknown"}).`;
    process.stderr.write(`${message}\nNo statement was run.\n`);
    process.exitCode = 1;
    return;
  }
  const repoRoot = resolve(import.meta.dirname, "..");
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (value !== undefined) childEnv[key] = value;
  const dbDir = join(repoRoot, "packages", "db");
  const bin = findDrizzleKitBin(dbDir);
  if (bin === undefined) {
    process.stderr.write("Could not find drizzle-kit. Run npm install.\n");
    process.exitCode = 1;
    return;
  }
  const child = spawn(process.execPath, [bin, "migrate", "--config", "drizzle.config.ts"], {
    cwd: dbDir,
    env: childEnv,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk.toString()));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk.toString()));
  child.on("error", (e) => {
    process.stderr.write(`Could not start drizzle-kit (${e.name}).\n`);
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
}

main();
