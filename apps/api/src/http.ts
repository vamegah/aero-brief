/** Response helpers and the API error envelope: { error: { code, message } }. */

export type ErrorEnvelope = { error: { code: string; message: string } };

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  return jsonResponse(status, body, headers);
}

/**
 * Thrown by handlers for an expected, client-visible failure (for example 409 or 429).
 * The router turns it into the error envelope. Any other thrown value is treated as a
 * dependency (database) failure and becomes 503.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Readonly<Record<string, string>>;

  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}
