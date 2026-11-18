// Zod validation of the rotation inputs, only for the selected targets. Pure: takes a record.
import { z } from "zod";
import type { Target } from "./args.ts";

const required = z.string().min(1);

const neonInputs = z.object({
  NEON_API_KEY: required,
  NEON_PROJECT_ID: required,
  NEON_BRANCH_ID: required,
  NEON_ROLE_NAME: required,
  FRONTEND_URL: z.url(),
});

const resendInputs = z.object({
  RESEND_ADMIN_API_KEY: required,
  RESEND_API_KEY_ID: required,
  MAIL_FROM: required,
  RESEND_DOMAIN_ID: required.optional(),
  RESEND_DOMAIN_NAME: required.default("aerobriefs.com"),
});

const unsubscribeInputs = z.object({
  UNSUBSCRIBE_SECRET: required,
});

export type NeonInputs = z.infer<typeof neonInputs>;
export type ResendInputs = z.infer<typeof resendInputs>;
export type UnsubscribeInputs = z.infer<typeof unsubscribeInputs>;

export interface RotationInputs {
  neon?: NeonInputs;
  resend?: ResendInputs;
  unsubscribe?: UnsubscribeInputs;
}

export type InputsResult =
  | { ok: true; inputs: RotationInputs }
  | { ok: false; invalid: string[] };

/** Validates only what the selected targets need. Failures list variable names, never values. */
export function validateInputs(
  env: Readonly<Record<string, string | undefined>>,
  targets: readonly Target[],
): InputsResult {
  // Empty values count as missing.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== "") clean[k] = v;

  const inputs: RotationInputs = {};
  const invalid = new Set<string>();
  const check = <T>(schema: z.ZodType<T>, assign: (v: T) => void): void => {
    const r = schema.safeParse(clean);
    if (r.success) assign(r.data);
    else for (const issue of r.error.issues) invalid.add(String(issue.path[0] ?? "(env)"));
  };
  if (targets.includes("neon")) check(neonInputs, (v) => (inputs.neon = v));
  if (targets.includes("resend")) check(resendInputs, (v) => (inputs.resend = v));
  if (targets.includes("unsubscribe")) check(unsubscribeInputs, (v) => (inputs.unsubscribe = v));
  return invalid.size > 0 ? { ok: false, invalid: [...invalid] } : { ok: true, inputs };
}
