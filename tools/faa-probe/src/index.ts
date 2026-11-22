// Throwaway diagnostic Worker. Calls only the FAA URL, three ways, and reports what came back.
// No bindings, no secrets, no cron. Delete after use (see README.md).

export const FAA_URL = "https://nasstatus.faa.gov/api/airport-events";
export const TIMEOUT_MS = 10_000;
export const BODY_LIMIT = 300;

const AEROBRIEF_UA = "AeroBrief/1.0 (+https://www.aerobriefs.com)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type Variant = { name: string; headers: Record<string, string> };

export const VARIANTS: readonly Variant[] = [
  { name: "no_headers", headers: {} },
  { name: "aerobrief_ua", headers: { "User-Agent": AEROBRIEF_UA, Accept: "application/json" } },
  { name: "browser_ua", headers: { "User-Agent": BROWSER_UA } },
];

const EXACT_HEADERS = new Set(["server", "via", "cf-ray", "content-type", "retry-after", "x-cache", "x-served-by"]);
const PREFIX_HEADERS = ["x-akamai-", "akamai-", "x-amzn-"];

export type VariantResult =
  | { name: string; ok: true; status: number; headers: Record<string, string>; body: string }
  | { name: string; ok: false; error: string };

export type FetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

function pickHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (EXACT_HEADERS.has(k) || PREFIX_HEADERS.some((p) => k.startsWith(p))) out[k] = value;
  });
  return out;
}

async function runVariant(fetchFn: FetchFn, v: Variant): Promise<VariantResult> {
  try {
    const res = await fetchFn(FAA_URL, { headers: v.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    return { name: v.name, ok: true, status: res.status, headers: pickHeaders(res.headers), body: text.slice(0, BODY_LIMIT) };
  } catch (e) {
    return { name: v.name, ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

export async function probe(fetchFn: FetchFn): Promise<VariantResult[]> {
  const results: VariantResult[] = [];
  for (const v of VARIANTS) results.push(await runVariant(fetchFn, v));
  return results;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const variants = await probe((url, init) => fetch(url, init));
    const body = {
      probe: { cfRay: request.headers.get("cf-ray"), colo: request.cf?.colo ?? null },
      url: FAA_URL,
      variants,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  },
} satisfies ExportedHandler;
