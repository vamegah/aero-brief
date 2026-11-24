/**
 * Minimal CSS reader for layout regression tests. It handles comments, one level of
 * `@media` nesting, and comma-separated selectors. It is not a general CSS parser.
 */
export interface CssRule {
  /** Normalized selector, one per comma-separated part. */
  selectors: string[];
  /** The `@media` condition this rule sits in, or null at top level. */
  media: string | null;
  /** Property to value, lower-cased and trimmed. A later declaration overrides an earlier one. */
  decls: Map<string, string>;
}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

function parseDecls(body: string): Map<string, string> {
  const decls = new Map<string, string>();
  // Split on ';' outside parentheses so data URIs and calc() survive.
  let depth = 0;
  let cur = "";
  const parts: string[] = [];
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls.set(prop, norm(part.slice(i + 1)).toLowerCase());
  }
  return decls;
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseCss(css: string): CssRule[] {
  const text = stripComments(css);
  const rules: CssRule[] = [];
  const walk = (src: string, media: string | null): void => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) break;
      const prelude = norm(src.slice(i, open));
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      if (prelude.startsWith("@media")) walk(body, norm(prelude.slice(6)).toLowerCase());
      else if (!prelude.startsWith("@")) {
        rules.push({
          selectors: prelude.split(",").map(norm).filter(Boolean),
          media,
          decls: parseDecls(body),
        });
      }
      i = j;
    }
  };
  walk(text, null);
  return rules;
}

/** Rules whose selector list contains exactly `selector`, optionally inside a given media block. */
export function findRules(
  rules: CssRule[],
  selector: string,
  media: string | null | undefined = undefined,
): CssRule[] {
  return rules.filter(
    (r) => r.selectors.includes(selector) && (media === undefined || r.media === media),
  );
}

/** The final value of `prop` across all matching rules, or undefined. */
export function declared(
  rules: CssRule[],
  selector: string,
  prop: string,
  media: string | null | undefined = undefined,
): string | undefined {
  let value: string | undefined;
  for (const r of findRules(rules, selector, media)) {
    const v = r.decls.get(prop);
    if (v !== undefined) value = v;
  }
  return value;
}
