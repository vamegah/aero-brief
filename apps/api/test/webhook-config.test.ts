import type { LogSink } from "@aerobrief/core";
import { describe, expect, it } from "vitest";
import { createFetchHandler } from "../src/router";
import { readWebhookConfig, webhookSecretToRedact } from "../src/webhook-config";

const SECRET = "m".repeat(32) + "-master-secret-value";

describe("readWebhookConfig", () => {
  it("answers 503 naming only WEBHOOK_MASTER_SECRET when missing", async () => {
    const r = readWebhookConfig({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(503);
    expect(r.response.headers.get("Retry-After")).toBeNull();
    const body = (await r.response.json()) as { error: { code: string; message: string } };
    expect(body.error.message).toContain("WEBHOOK_MASTER_SECRET");
    expect(body.error.message).not.toMatch(/SAFE_SEND|DATABASE_URL|RESEND/);
  });

  it("rejects a short secret without echoing it", async () => {
    const short = "s".repeat(31);
    const r = readWebhookConfig({ WEBHOOK_MASTER_SECRET: short });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(503);
    expect(await r.response.text()).not.toContain(short);
  });

  it("treats non-object env and non-string values as missing", () => {
    expect(readWebhookConfig(null).ok).toBe(false);
    expect(readWebhookConfig({ WEBHOOK_MASTER_SECRET: 42 }).ok).toBe(false);
  });

  it("accepts a 32-character secret and defaults Safe_Send_Mode on", () => {
    const r = readWebhookConfig({ WEBHOOK_MASTER_SECRET: "x".repeat(32) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.safeSendMode).toBe(true);
    expect(r.config.safeSendEmails).toEqual(["delivered@resend.dev"]);
    expect(r.config.safeSendHosts).toEqual([]);
  });

  it("turns Safe_Send_Mode off only for the exact string false", () => {
    const base = { WEBHOOK_MASTER_SECRET: SECRET };
    const off = readWebhookConfig({ ...base, SAFE_SEND_MODE: "false" });
    const odd = readWebhookConfig({ ...base, SAFE_SEND_MODE: "FALSE" });
    expect(off.ok && off.config.safeSendMode).toBe(false);
    expect(odd.ok && odd.config.safeSendMode).toBe(true);
  });

  it("parses the allowlists", () => {
    const r = readWebhookConfig({
      WEBHOOK_MASTER_SECRET: SECRET,
      SAFE_SEND_ALLOWLIST_EMAILS: " Me@Example.com , you@example.com ",
      SAFE_SEND_ALLOWLIST_HOSTS: "Hooks.Example.com",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.safeSendEmails).toEqual(
      expect.arrayContaining(["me@example.com", "you@example.com", "delivered@resend.dev"]),
    );
    expect(r.config.safeSendHosts).toEqual(["hooks.example.com"]);
  });
});

describe("webhookSecretToRedact", () => {
  it("returns the value only when set and non-empty", () => {
    expect(webhookSecretToRedact({})).toBeUndefined();
    expect(webhookSecretToRedact({ WEBHOOK_MASTER_SECRET: "" })).toBeUndefined();
    expect(webhookSecretToRedact(undefined)).toBeUndefined();
    expect(webhookSecretToRedact({ WEBHOOK_MASTER_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("router logger redaction", () => {
  it("redacts WEBHOOK_MASTER_SECRET from log lines and the response", async () => {
    const lines: string[] = [];
    const write = (line: string): void => {
      lines.push(line);
    };
    const sink: LogSink = { debug: write, info: write, warn: write, error: write };
    const handler = createFetchHandler(
      [
        {
          method: "GET",
          pattern: "/api/boom",
          auth: "none",
          handler: async () => {
            throw new Error(`failure with ${SECRET}`);
          },
        },
      ],
      { logSink: sink },
    );
    const env = {
      DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
      RESEND_API_KEY: "re_secret_value",
      UNSUBSCRIBE_SECRET: "unsub_secret_value",
      FRONTEND_URL: "https://app.example.com",
      MAIL_FROM: "AeroBrief <alerts@example.com>",
      WEBHOOK_MASTER_SECRET: SECRET,
    };
    const res = await handler(new Request("https://api.example.com/api/boom"), env);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain(SECRET);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(SECRET);
  });
});
