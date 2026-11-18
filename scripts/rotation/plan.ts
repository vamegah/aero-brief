// Plan building for the rotation script. Pure: no I/O.
import type { Target } from "./args.ts";

export interface PlanStep {
  id: string;
  target: Target | "preflight" | "local";
  description: string;
}

export interface Plan {
  dryRun: boolean;
  steps: PlanStep[];
}

const WORKERS = ["api", "poller"] as const;

function neonSteps(): PlanStep[] {
  return [
    { id: "neon:reset-password", target: "neon", description: "Reset the Neon role password (old password stops working)" },
    ...WORKERS.map((w) => ({
      id: `neon:put-DATABASE_URL:${w}`,
      target: "neon" as const,
      description: `wrangler secret put DATABASE_URL on the ${w} Worker`,
    })),
    { id: "neon:verify-status", target: "neon", description: "Verify GET /api/status/national returns 200 (reads the database)" },
  ];
}

function resendSteps(): PlanStep[] {
  return [
    { id: "resend:create-key", target: "resend", description: "Create a new sending-only Resend key restricted to the domain" },
    ...WORKERS.map((w) => ({
      id: `resend:put-RESEND_API_KEY:${w}`,
      target: "resend" as const,
      description: `wrangler secret put RESEND_API_KEY on the ${w} Worker`,
    })),
    { id: "resend:verify-send", target: "resend", description: "Verify the new key by sending one email to delivered@resend.dev" },
    { id: "resend:delete-old-key", target: "resend", description: "Delete the old Resend key (only after the new key verified)" },
  ];
}

function unsubscribeSteps(): PlanStep[] {
  return [
    { id: "unsubscribe:put-UNSUBSCRIBE_SECRET_PREVIOUS:api", target: "unsubscribe", description: "Keep the old secret on the api Worker as UNSUBSCRIBE_SECRET_PREVIOUS" },
    { id: "unsubscribe:put-UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT:api", target: "unsubscribe", description: "Set UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT on the api Worker to now + 30 days" },
    ...WORKERS.map((w) => ({
      id: `unsubscribe:put-UNSUBSCRIBE_SECRET:${w}`,
      target: "unsubscribe" as const,
      description: `wrangler secret put UNSUBSCRIBE_SECRET (new random value) on the ${w} Worker`,
    })),
  ];
}

/** Builds the ordered step list. Targets always run in the order neon, resend, unsubscribe. */
export function buildPlan(options: { targets: readonly Target[]; dryRun: boolean }): Plan {
  const has = (t: Target): boolean => options.targets.includes(t);
  const steps: PlanStep[] = [
    { id: "preflight", target: "preflight", description: "Validate inputs and confirm `wrangler whoami` works" },
  ];
  if (has("neon")) steps.push(...neonSteps());
  if (has("resend")) steps.push(...resendSteps());
  if (has("unsubscribe")) steps.push(...unsubscribeSteps());
  steps.push({
    id: "local:write-env",
    target: "local",
    description: "Copy .env to .env.backup, then rewrite .env atomically (only the affected lines)",
  });
  return { dryRun: options.dryRun, steps };
}
