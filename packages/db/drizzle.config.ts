import { defineConfig } from "drizzle-kit";
import { z } from "zod";

// The root tsconfig has no Node types (by choice), so declare only what is read here.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://"),
});

function requireDatabaseUrl(): string {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report only the field name and rule. Never echo the value: it contains credentials.
    const issue = parsed.error.issues[0];
    throw new Error(`DATABASE_URL is invalid: ${issue?.message ?? "unknown error"}`);
  }
  return parsed.data.DATABASE_URL;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: requireDatabaseUrl() },
});
