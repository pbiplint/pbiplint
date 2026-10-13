import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { lint } from "../../packages/core/src/index.ts";
import { tempDir } from "../../tests/support/temp-dir.js";
import { bigModelFiles, makeBigModel, PARTITIONS } from "../make-big-model.mjs";

// The parse-time guard (v3 spec, section 11.5): a model as heavy to parse as the corpus's slowest,
// about 400,000 tokens of M. CI measured its lint at 6.4 s on Node 20 and 3.6 s on Node 22 on
// October 13, 2026 (Node 20 runs this parser about 1.75 times slower than 22); Michael's Mac takes
// about 1.2 s. The budget is three times CI's slowest, rounded up to the next 5 s, so a slow runner
// does not flake it, while a parser that turned quadratic on 400,000 tokens would take minutes.
const BUDGET_MS = 20_000;

describe("the big model", () => {
  it("writes 8 M partitions to a definition folder", () => {
    const out = tempDir("big-model");
    expect(makeBigModel(out)).toBe(PARTITIONS);
    const tables = readdirSync(join(out, "big-model.SemanticModel", "definition", "tables"));
    expect(tables).toHaveLength(PARTITIONS);
  });
  it("refuses a folder that holds anything but an earlier big model, and leaves it alone", () => {
    const out = tempDir("big-model");
    writeFileSync(join(out, "keep.txt"), "Not the big model.\n");
    expect(() => makeBigModel(out)).toThrow(/holds more than an earlier big model/);
    expect(readdirSync(out)).toEqual(["keep.txt"]);
  });
  it(`lints in under ${BUDGET_MS / 1000} seconds, every M expression read`, async () => {
    const started = performance.now();
    const result = await lint(bigModelFiles());
    const ms = performance.now() - started;
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 60_000);
});
