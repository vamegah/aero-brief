import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertPhase2Target, Phase2TargetError } from "../src/phase2-target";

const BRANCH = "ep-branch-123.us-east-2.aws.neon.tech";
const PROD = "ep-prod-456.us-east-2.aws.neon.tech";
const url = (host: string, password = "s3cret!pw") => `postgresql://owner:${password}@${host}/neondb?sslmode=require`;

describe("assertPhase2Target", () => {
  it("accepts the branch host, pooled or direct", () => {
    expect(() => assertPhase2Target(url(BRANCH), BRANCH, PROD)).not.toThrow();
    expect(() => assertPhase2Target(url("ep-branch-123-pooler.us-east-2.aws.neon.tech"), BRANCH, PROD)).not.toThrow();
    expect(() => assertPhase2Target(url(BRANCH), "ep-branch-123-pooler.us-east-2.aws.neon.tech", PROD)).not.toThrow();
  });

  it("refuses when expectedHost is unset or blank", () => {
    expect(() => assertPhase2Target(url(BRANCH), undefined, PROD)).toThrow(Phase2TargetError);
    expect(() => assertPhase2Target(url(BRANCH), "  ", PROD)).toThrow(Phase2TargetError);
  });

  it("refuses when the production host is unset (fail closed)", () => {
    expect(() => assertPhase2Target(url(BRANCH), BRANCH, undefined)).toThrow(Phase2TargetError);
  });

  it("refuses a different host", () => {
    expect(() => assertPhase2Target(url("ep-other-789.us-east-2.aws.neon.tech"), BRANCH, PROD)).toThrow(/not the Phase 2 branch host/);
  });

  it("refuses the production host, pooled or direct, even if expectedHost is set to it", () => {
    expect(() => assertPhase2Target(url(PROD), PROD, PROD)).toThrow(Phase2TargetError);
    expect(() => assertPhase2Target(url("ep-prod-456-pooler.us-east-2.aws.neon.tech"), BRANCH, PROD)).toThrow(/production/);
  });

  it("refuses a missing or malformed URL without echoing it", () => {
    expect(() => assertPhase2Target(undefined, BRANCH, PROD)).toThrow(Phase2TargetError);
    expect(() => assertPhase2Target("not a url with hunter2", BRANCH, PROD)).toThrow(Phase2TargetError);
    try {
      assertPhase2Target("not a url with hunter2", BRANCH, PROD);
    } catch (e) {
      expect(String(e)).not.toContain("hunter2");
    }
  });

  it("never includes the password, user or full URL in an error", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9]{8,20}$/), (password) => {
        for (const [target, expected] of [
          [url("ep-other-789.us-east-2.aws.neon.tech", password), BRANCH],
          [url(PROD, password), BRANCH],
          [url(BRANCH, password), undefined],
        ] as const) {
          try {
            assertPhase2Target(target, expected, PROD);
            return false;
          } catch (e) {
            const text = String(e);
            if (text.includes(password) || text.includes("owner") || text.includes("postgresql://")) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
