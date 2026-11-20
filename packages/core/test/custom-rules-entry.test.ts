import { describe, expect, it } from "vitest";
import { RULE_FILE_BYTES, VERSION } from "@pbiplint/core";
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
  it("gives the main entry the rule file size limit the reader holds to", () => {
    // The site checks a rule file's size before the custom rules chunk has arrived.
    expect(RULE_FILE_BYTES).toBe(entry.LIMITS.fileBytes);
  });
});
