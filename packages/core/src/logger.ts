/**
 * Secret-safe structured logger (Requirement 14.10).
 *
 * Pure: it never reads env. Callers pass the secret values to redact.
 * - Fields named `env` or `headers` (any case, at any depth) are replaced by a placeholder.
 * - Every occurrence of each secret is replaced in all strings, including Error messages and stacks.
 * - Output is one JSON line per call: { level, msg, fields }.
 * - A log call never throws.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogSink = Record<LogLevel, (line: string) => void>;

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export const REDACTED = "[REDACTED]";
export const OMITTED = "[OMITTED]";
export const CIRCULAR = "[Circular]";
const TRUNCATED = "[Truncated]";
const MAX_DEPTH = 8;
const FORBIDDEN_KEYS = new Set(["env", "headers"]);

const consoleSink: LogSink = {
  debug: (line) => console.debug(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

export function createLogger(secrets: readonly string[] = [], sink: LogSink = consoleSink): Logger {
  // Drop empty / non-string secrets; longest first so a secret containing another is fully removed.
  const active = [...new Set(secrets.filter((s) => typeof s === "string" && s.length > 0))].sort(
    (a, b) => b.length - a.length,
  );

  const redact = (text: string): string => {
    let out = text;
    for (const secret of active) out = out.split(secret).join(REDACTED);
    return out;
  };

  const sanitize = (value: unknown, seen: WeakSet<object>, depth: number): unknown => {
    switch (typeof value) {
      case "string":
        return redact(value);
      case "number":
      case "boolean":
      case "undefined":
        return value;
      case "bigint":
        return redact(value.toString());
      case "symbol":
        return redact(value.toString());
      case "function":
        return "[Function]";
    }
    if (value === null) return null;
    const obj = value as object;
    if (seen.has(obj)) return CIRCULAR;
    if (depth >= MAX_DEPTH) return TRUNCATED;
    seen.add(obj);
    try {
      if (obj instanceof Error) {
        const out: Record<string, unknown> = {
          name: redact(obj.name),
          message: redact(obj.message),
        };
        if (obj.stack !== undefined) out["stack"] = redact(obj.stack);
        if ("cause" in obj && obj.cause !== undefined) out["cause"] = sanitize(obj.cause, seen, depth + 1);
        return out;
      }
      if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
      if (Array.isArray(obj)) return obj.map((item) => sanitize(item, seen, depth + 1));
      if (obj instanceof Map) {
        return sanitizeEntries(Array.from(obj.entries()), seen, depth);
      }
      if (obj instanceof Set) return Array.from(obj).map((item) => sanitize(item, seen, depth + 1));
      return sanitizeEntries(Object.entries(obj), seen, depth);
    } finally {
      // Only ancestors count as circular; shared siblings are fine.
      seen.delete(obj);
    }
  };

  const sanitizeEntries = (
    entries: [unknown, unknown][],
    seen: WeakSet<object>,
    depth: number,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [rawKey, val] of entries) {
      const key = redact(String(rawKey));
      out[key] = FORBIDDEN_KEYS.has(String(rawKey).toLowerCase())
        ? OMITTED
        : sanitize(val, seen, depth + 1);
    }
    return out;
  };

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    try {
      const line = JSON.stringify({
        level,
        msg: redact(String(msg)),
        fields: fields === undefined ? {} : sanitize(fields, new WeakSet(), 0),
      });
      sink[level](line);
    } catch {
      try {
        sink[level](JSON.stringify({ level, msg: "log_serialization_failed", fields: {} }));
      } catch {
        // A log call must never throw.
      }
    }
  };

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
  };
}
