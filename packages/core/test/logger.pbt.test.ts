import { describe, it } from "vitest";
import fc from "fast-check";
import { createLogger, type LogSink } from "../src/logger";

// Feature: aerobrief, Property 32: Secrets never reach logs
// **Validates: Requirements 14.10**

const secretArb = fc
  .stringMatching(/^[A-Za-z0-9]{8,24}$/)
  .map((s) => `sk_${s}`);
const keyArb = fc.stringMatching(/^[A-Z][A-Z_]{2,12}$/);
const levelArb = fc.constantFrom(...(["debug", "info", "warn", "error"] as const));

describe("Property 32: Secrets never reach logs", () => {
  it("serialized log output never contains any secret", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(secretArb, { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(keyArb, { minLength: 1, maxLength: 5 }),
        levelArb,
        fc.boolean(),
        fc.string({ maxLength: 12 }),
        (secrets, keys, level, useUpperHeaders, filler) => {
          const env: Record<string, string> = {};
          keys.forEach((k, i) => {
            env[k] = secrets[i % secrets.length]!;
          });
          const headers = {
            authorization: `Bearer ${secrets[0]}`,
            "x-api-key": secrets[secrets.length - 1]!,
          };
          const err = new Error(`failed ${filler} ${secrets.join("|")}`);
          err.stack = `Error: ${secrets.join(",")}\n    at x`;

          const lines: string[] = [];
          const push = (l: string) => void lines.push(l);
          const sink: LogSink = { debug: push, info: push, warn: push, error: push };
          const log = createLogger(secrets, sink);

          const msg = `ctx ${filler} ${secrets.join(" ")}`;
          log[level](msg, {
            env,
            [useUpperHeaders ? "Headers" : "headers"]: headers,
            request: { headers, nested: { env } },
            err,
            inline: secrets.map((s) => `${filler}${s}${s}`),
            [secrets[0]!]: "keyed",
          });
          // Also log the raw env and headers objects directly as a field value.
          log[level]("again", { e: env, h: headers, errs: [err] });

          if (lines.length !== 2) return false;
          return lines.every((line) => secrets.every((s) => !line.includes(s)));
        },
      ),
      { numRuns: 200 },
    );
  });
});
