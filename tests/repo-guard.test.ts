// Repo guard. Runs in Node under Vitest (not in the Workers runtime), so it may use
// node:fs and node:path to scan the repository. Validates Requirements 14.1, 14.8
// (TypeScript only, strict everywhere, no Hono, no password columns / Requirement 7.7).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = resolve(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".wrangler", "coverage", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const ALL_FILES = walk(ROOT);
const rel = (p: string): string => relative(ROOT, p).split(sep).join("/");
const read = (p: string): string => readFileSync(p, "utf8");

/** Parse JSON that may contain // and /* *\/ comments and trailing commas. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const n = text[i + 1];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // Remove trailing commas (outside strings, which the regex callback preserves).
  out = out.replace(/"(?:[^"\\]|\\.)*"|,(\s*[}\]])/g, (m, tail: string | undefined) =>
    tail === undefined ? m : tail,
  );
  return JSON.parse(out);
}

type TsConfig = { extends?: string | string[]; compilerOptions?: { strict?: unknown } };

function loadTsConfig(file: string): TsConfig {
  return parseJsonc(read(file)) as TsConfig;
}

function resolveExtends(from: string, spec: string): string {
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    throw new Error(`${rel(from)}: non-relative extends "${spec}" is not supported by the guard`);
  }
  const p = resolve(dirname(from), spec);
  return p.endsWith(".json") ? p : `${p}.json`;
}

/** Effective `strict`: the nearest definition wins; later `extends` entries override earlier. */
function effectiveStrict(file: string, seen = new Set<string>()): unknown {
  if (seen.has(file)) throw new Error(`${rel(file)}: circular extends`);
  seen.add(file);
  const cfg = loadTsConfig(file);
  if (cfg.compilerOptions && "strict" in cfg.compilerOptions) return cfg.compilerOptions.strict;
  const parents = cfg.extends === undefined ? [] : Array.isArray(cfg.extends) ? cfg.extends : [cfg.extends];
  for (const spec of [...parents].reverse()) {
    const v = effectiveStrict(resolveExtends(file, spec), new Set(seen));
    if (v !== undefined) return v;
  }
  return undefined;
}

const PASSWORD_TOKEN = /^pass(word|wd)?$/i;

/** Split snake_case, kebab-case, camelCase and PascalCase into words. */
function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** True for password, passwd, pass, password_hash, passwordHash. False for passenger, bypass, compass. */
export function isPasswordName(name: string): boolean {
  return nameTokens(name).some((t) => PASSWORD_TOKEN.test(t));
}

function stripTsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`\\])\/\/.*$/gm, (_m, pre: string | undefined) => pre ?? "");
}

/** Declared names: object/property keys and string-literal first args such as text("password"). */
export function declaredNames(src: string): string[] {
  const code = stripTsComments(src);
  const names: string[] = [];
  for (const m of code.matchAll(/["']?([A-Za-z_$][\w$-]*)["']?\s*\??\s*:/g)) names.push(m[1]!);
  for (const m of code.matchAll(/\b\w+\s*\(\s*["'`]([^"'`\n]+)["'`]/g)) names.push(m[1]!);
  return names;
}

const isTsSource = (p: string): boolean => /\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts");

describe("repo guard", () => {
  it("contains no .js, .jsx, .mjs or .cjs files (Req 14.1)", () => {
    const offenders = ALL_FILES.filter((p) => /\.(js|jsx|mjs|cjs)$/i.test(p)).map(rel);
    expect(offenders).toEqual([]);
  });

  it("every tsconfig*.json has strict: true, directly or via extends (Req 14.1)", () => {
    const configs = ALL_FILES.filter((p) => /^tsconfig[^/\\]*\.json$/.test(p.split(sep).pop()!));
    expect(configs.length).toBeGreaterThan(0);
    const offenders = configs.filter((p) => effectiveStrict(p) !== true).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no package.json lists hono as a dependency (Req 14.8)", () => {
    const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
    const offenders: string[] = [];
    for (const p of ALL_FILES.filter((f) => f.endsWith(`${sep}package.json`))) {
      const pkg = parseJsonc(read(p)) as Record<string, unknown>;
      for (const f of fields) {
        const deps = pkg[f];
        if (deps && typeof deps === "object" && "hono" in deps) offenders.push(`${rel(p)} (${f})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no TypeScript source imports hono or hono/* (Req 14.8)", () => {
    const importRe = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']hono(?:\/[^"']*)?["']/;
    const offenders = ALL_FILES.filter((p) => isTsSource(p) && p !== SELF)
      .filter((p) => importRe.test(read(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no schema declares a password-like column or field (Req 7.7)", () => {
    const isSchemaFile = (p: string): boolean => {
      const r = rel(p);
      if (!isTsSource(p) || p === SELF || /\.test\.tsx?$/.test(r)) return false;
      return r.split("/").includes("db") || r.toLowerCase().includes("schema");
    };
    const offenders: string[] = [];
    for (const p of ALL_FILES.filter(isSchemaFile)) {
      for (const name of declaredNames(read(p))) {
        if (isPasswordName(name)) offenders.push(`${rel(p)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("repo guard helpers", () => {
  it("isPasswordName flags password-like names only", () => {
    for (const n of ["password", "passwd", "pass", "password_hash", "passwordHash", "user_Password"]) {
      expect(isPasswordName(n)).toBe(true);
    }
    for (const n of ["passenger", "bypass", "compass", "passage", "email", "bypassFlag"]) {
      expect(isPasswordName(n)).toBe(false);
    }
  });

  it("parseJsonc tolerates comments and trailing commas", () => {
    const v = parseJsonc('{ // c\n "a": "x//y", /* b */ "b": [1,2,], }');
    expect(v).toEqual({ a: "x//y", b: [1, 2] });
  });
});
