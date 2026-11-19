export type UrlRejectReason =
  | "too_long"
  | "unparseable"
  | "scheme"
  | "credentials"
  | "port"
  | "fragment"
  | "trailing_dot"
  | "ipv6"
  | "ip_literal"
  | "localhost"
  | "single_label"
  | "reserved_suffix";

export type WebhookUrlResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: UrlRejectReason };

export const MAX_WEBHOOK_URL_LENGTH = 2048;

const RESERVED_SUFFIXES = [
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
] as const;

function fail(reason: UrlRejectReason): WebhookUrlResult {
  return { ok: false, reason };
}

/** Validate a webhook destination. Rules run in the order the design lists them. */
export function validateWebhookUrl(input: string): WebhookUrlResult {
  if (input.length > MAX_WEBHOOK_URL_LENGTH) return fail("too_long");

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return fail("unparseable");
  }

  if (parsed.protocol !== "https:") return fail("scheme");
  if (parsed.username !== "" || parsed.password !== "") return fail("credentials");
  if (parsed.port !== "") return fail("port");
  if (parsed.hash !== "") return fail("fragment");

  const host = parsed.hostname;
  if (host.endsWith(".")) return fail("trailing_dot");
  if (host.startsWith("[")) return fail("ipv6");

  const lastLabel = host.slice(host.lastIndexOf(".") + 1);
  if (/^[0-9]+$/.test(lastLabel) || lastLabel.startsWith("0x")) return fail("ip_literal");

  if (host === "localhost" || host.endsWith(".localhost")) return fail("localhost");
  if (!host.includes(".")) return fail("single_label");
  if (RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return fail("reserved_suffix");

  return { ok: true, url: parsed.href, host };
}

/** Return only the host of a webhook URL: no path, query, userinfo or port. */
export function maskWebhookUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
