// Pure helpers for .env text. No I/O. Error messages name keys, never values.

const LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

interface ParsedValue {
  value: string;
  quote: '"' | "'" | null;
  /** Text after the value (spacing plus inline comment), kept when a line is rewritten. */
  suffix: string;
}

function parseValue(rest: string): ParsedValue {
  const first = rest[0];
  if (first === '"' || first === "'") {
    const close = rest.indexOf(first, 1);
    if (close !== -1) {
      return { value: rest.slice(1, close), quote: first, suffix: rest.slice(close + 1) };
    }
  }
  const comment = rest.search(/\s#/);
  if (comment === -1) return { value: rest.trim(), quote: null, suffix: "" };
  return { value: rest.slice(0, comment).trim(), quote: null, suffix: rest.slice(comment) };
}

/** Parses KEY=value lines. Later duplicates do not override the first, like dotenv. */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = LINE.exec(line);
    if (m === null) continue;
    const key = m[2]!;
    if (key in out) continue;
    out[key] = parseValue(m[4]!).value;
  }
  return out;
}

function formatValue(key: string, value: string, preferred: '"' | "'" | null): string {
  if (/[\r\n]/.test(value)) throw new Error(`Value for ${key} contains a line break and cannot be written to .env`);
  if (preferred !== null && !value.includes(preferred)) return `${preferred}${value}${preferred}`;
  if (!/[\s#"'`$\\]/.test(value) && value !== "") return value;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new Error(`Value for ${key} cannot be quoted for .env`);
}

/**
 * Sets KEY=value for each update. Existing lines keep their position, indentation, `export`
 * prefix, quote style and trailing comment. Unknown keys are appended at the end. Other lines,
 * comments and the line-ending style are untouched.
 */
export function updateEnvText(text: string, updates: Readonly<Record<string, string>>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const remaining = new Set(Object.keys(updates));
  const lines = text.split("\n").map((raw) => {
    const cr = raw.endsWith("\r");
    const line = cr ? raw.slice(0, -1) : raw;
    const m = LINE.exec(line);
    const key = m?.[2];
    if (m === null || key === undefined || !(key in updates)) return raw;
    remaining.delete(key);
    const parsed = parseValue(m[4]!);
    const next = formatValue(key, updates[key]!, parsed.quote);
    return `${m[1]}${key}${m[3]}${next}${parsed.suffix}${cr ? "\r" : ""}`;
  });

  let result = lines.join("\n");
  if (remaining.size > 0) {
    if (result !== "" && !result.endsWith("\n")) result += eol;
    for (const key of Object.keys(updates)) {
      if (remaining.has(key)) result += `${key}=${formatValue(key, updates[key]!, null)}${eol}`;
    }
  }
  return result;
}
