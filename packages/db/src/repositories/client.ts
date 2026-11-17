import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../schema";

/**
 * Builds the Drizzle client over the Neon HTTP driver.
 * The caller (a Worker) passes the URL in; this package never reads process.env,
 * and never logs or echoes the URL because it contains credentials.
 */
export function createDb(databaseUrl: string) {
  const client = neon(databaseUrl);
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;
