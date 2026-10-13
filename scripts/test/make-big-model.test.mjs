import { readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { lint } from "../../packages/core/src/index.ts";
import { tempDir } from "../../tests/support/temp-dir.js";
import { bigModelFiles, makeBigModel, PARTITIONS } from "../make-big-model.mjs";

// The parse-time guard (v3 spec, section 11.5): a model as heavy to parse as the corpus's slowest,
// about 400,000 tokens of M that Microsoft's parser read in 656 ms on October 13, 2026. Five
// seconds leaves room for a slow runner and none for a parser that has turned quadratic.
const BUDGET_MS = 5000;

describe("the big model", () => {
  it("writes 8 M partitions to a definition folder", () => {
    const out = tempDir("big-model");
    expect(makeBigModel(out)).toBe(PARTITIONS);
    const tables = readdirSync(join(out, "big-model.SemanticModel", "definition", "tables"));
    expect(tables).toHaveLength(PARTITIONS);
  });
  it(`lints in under ${BUDGET_MS / 1000} seconds, every M expression read`, async () => {
    const started = performance.now();
    const result = await lint(bigModelFiles());
    const ms = performance.now() - started;
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 30_000);
});
