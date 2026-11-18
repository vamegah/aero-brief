// Command-line parsing for scripts/rotate-secrets.ts. Pure: no I/O.

export const TARGETS = ["neon", "resend", "unsubscribe"] as const;
export type Target = (typeof TARGETS)[number];

export interface CliOptions {
  dryRun: boolean;
  /** Selected targets in canonical order (neon, resend, unsubscribe). */
  targets: Target[];
  confirmApiDeployed: boolean;
  /** Path given with --env-path, or null for the repo's .env. */
  envFile: string | null;
  help: boolean;
}

export type ParseResult = { ok: true; options: CliOptions } | { ok: false; error: string };

export const USAGE = [
  "Usage: npm run rotate-secrets -- [options]",
  "",
  "Rotates the Neon role password, the Resend API key and the UNSUBSCRIBE_SECRET.",
  "",
  "Options:",
  "  --dry-run                 Print the planned steps. No external call, no file change.",
  "  --only=<list>             Comma-separated subset of: neon, resend, unsubscribe.",
  "  --confirm-api-deployed    Confirm the API with dual-secret unsubscribe support (task 19.1)",
  "                            is deployed. Required to rotate the unsubscribe secret;",
  "                            otherwise the script asks interactively.",
  "  --env-path <path>         Read and rewrite this env file instead of .env.",
  "  -h, --help                Show this help.",
].join("\n");

function parseTargets(raw: string): Target[] | string {
  const names = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (names.length === 0) return "--only needs at least one of: neon, resend, unsubscribe";
  const chosen = new Set<Target>();
  for (const name of names) {
    const match = TARGETS.find((t) => t === name);
    if (match === undefined) return `Unknown --only target "${name}". Use: ${TARGETS.join(", ")}`;
    chosen.add(match);
  }
  return TARGETS.filter((t) => chosen.has(t));
}

export function parseArgs(argv: readonly string[]): ParseResult {
  let dryRun = false;
  let confirmApiDeployed = false;
  let help = false;
  let envFile: string | null = null;
  let targets: Target[] = [...TARGETS];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--confirm-api-deployed") confirmApiDeployed = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--only" || arg.startsWith("--only=")) {
      let raw: string | undefined;
      if (arg === "--only") {
        raw = argv[++i];
      } else {
        raw = arg.slice("--only=".length);
      }
      if (raw === undefined) return { ok: false, error: "--only needs a value" };
      const parsed = parseTargets(raw);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      targets = parsed;
    } else if (arg === "--env-path" || arg.startsWith("--env-path=")) {
      const raw = arg === "--env-path" ? argv[++i] : arg.slice("--env-path=".length);
      if (raw === undefined || raw === "") return { ok: false, error: "--env-path needs a path" };
      envFile = raw;
    } else {
      return { ok: false, error: `Unknown option "${arg}"` };
    }
  }
  return { ok: true, options: { dryRun, targets, confirmApiDeployed, envFile, help } };
}
