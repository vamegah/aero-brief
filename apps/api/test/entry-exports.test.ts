import { describe, expect, it } from "vitest";
import * as mod from "../src/index";

// workerd treats every named export of the main module as an entrypoint and rejects non-handlers.
describe("api entry module", () => {
  it("has no named exports besides default", () => {
    expect(Object.keys(mod).filter((key) => key !== "default")).toEqual([]);
  });

  it("default export has a fetch function", () => {
    expect(typeof mod.default.fetch).toBe("function");
  });
});
