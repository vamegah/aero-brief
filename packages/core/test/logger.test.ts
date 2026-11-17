import { describe, expect, it } from "vitest";
import { createLogger, type LogSink } from "../src/logger";

const DB = "postgres://user:hunter2pass@host/db";
const KEY = "re_abc123SECRET";

function capture() {
  const lines: string[] = [];
  const push = (l: string) => void lines.push(l);
  const sink: LogSink = { debug: push, info: push, warn: push, error: push };
  return { lines, sink };
}

describe("createLogger", () => {
  it("emits a JSON line with level, msg and fields", () => {
    const { lines, sink } = capture();
    createLogger([], sink).warn("hello", { a: 1 });
    expect(JSON.parse(lines[0]!)).toEqual({ level: "warn", msg: "hello", fields: { a: 1 } });
  });

  it("redacts secrets in messages, including substrings and repeats", () => {
    const { lines, sink } = capture();
    createLogger([DB, KEY], sink).info(`connect ${DB} and key=${KEY}${KEY}`);
    expect(lines[0]).not.toContain("hunter2pass");
    expect(lines[0]).not.toContain("abc123SECRET");
  });

  it("redacts secrets in nested fields and keys", () => {
    const { lines, sink } = capture();
    createLogger([KEY], sink).info("x", { a: { b: [`Bearer ${KEY}`] }, [KEY]: 1 });
    expect(lines[0]).not.toContain("abc123SECRET");
    expect(lines[0]).toContain("Bearer [REDACTED]");
  });

  it("redacts secrets in Error message and stack", () => {
    const { lines, sink } = capture();
    const err = new Error(`failed with ${DB}`);
    err.stack = `Error: failed with ${DB}\n    at x`;
    createLogger([DB], sink).error("boom", { err, nested: { err } });
    expect(lines[0]).not.toContain("hunter2pass");
    expect(JSON.parse(lines[0]!).fields.err.message).toContain("[REDACTED]");
  });

  it("omits env and headers fields at any depth", () => {
    const { lines, sink } = capture();
    createLogger([], sink).info("x", {
      env: { DATABASE_URL: "leak1" },
      deep: { Headers: { authorization: "leak2" } },
      ok: 1,
    });
    expect(lines[0]).not.toContain("leak1");
    expect(lines[0]).not.toContain("leak2");
    expect(JSON.parse(lines[0]!).fields.ok).toBe(1);
  });

  it("does not throw on circular objects", () => {
    const { lines, sink } = capture();
    const a: Record<string, unknown> = { name: "a" };
    a["self"] = a;
    expect(() => createLogger([], sink).info("c", { a })).not.toThrow();
    expect(lines[0]).toContain("[Circular]");
  });

  it("ignores empty-string secrets", () => {
    const { lines, sink } = capture();
    createLogger(["", KEY], sink).info("plain text");
    expect(JSON.parse(lines[0]!).msg).toBe("plain text");
  });

  it("never throws when serialization or the sink fails", () => {
    const { sink } = capture();
    const log = createLogger([], sink);
    expect(() => log.info("x", { n: 1n, f: () => 1 })).not.toThrow();
    const bad: LogSink = {
      debug: () => { throw new Error("x"); },
      info: () => { throw new Error("x"); },
      warn: () => { throw new Error("x"); },
      error: () => { throw new Error("x"); },
    };
    expect(() => createLogger([], bad).info("x")).not.toThrow();
  });
});
