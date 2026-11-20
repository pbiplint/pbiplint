import { describe, expect, it } from "vitest";
import { VERSION } from "@pbiplint/core";
import * as entry from "@pbiplint/core/custom-rules";
import { runTeRules, STATISTICS_REASON } from "../src/custom-rules/te/index.js";

// The custom rules live in their own entry, so what the core's main entry reaches does not grow
// by the evaluator's size; the subpath must resolve to its own source, not through the main alias.
describe("the custom rules entry", () => {
  it("resolves @pbiplint/core/custom-rules to the custom rules source", () => {
    expect(entry.runTeRules).toBe(runTeRules);
    expect(entry.STATISTICS_REASON).toBe(STATISTICS_REASON);
  });
  it("leaves @pbiplint/core resolving to the main entry", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect("VERSION" in entry).toBe(false);
  });
});
