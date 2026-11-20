import { describe, expect, it, vi } from "vitest";

vi.mock("../src/poll", () => ({ runPoll: vi.fn(async () => undefined) }));
vi.mock("../src/cleanup", () => ({ runCleanup: vi.fn(async () => undefined) }));
vi.mock("../src/digest", () => ({ runDigest: vi.fn(async () => undefined) }));

import * as mod from "../src/index";

// workerd treats every named export of the main module as an entrypoint and rejects non-handlers.
describe("poller entry module", () => {
  it("has no named exports besides default", () => {
    expect(Object.keys(mod).filter((key) => key !== "default")).toEqual([]);
  });

  it("default export has a scheduled function", () => {
    expect(typeof mod.default.scheduled).toBe("function");
  });
});
