import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { SAMPLE_FILES } from "../src/sample.js";

describe("bundled sample", () => {
  it("is examples/messy-sales with model-relative paths", () => {
    expect(SAMPLE_FILES.length).toBe(11);
    expect(SAMPLE_FILES.map((f) => f.path)).toContain("definition/tables/Sales.tmdl");
    expect(SAMPLE_FILES.every((f) => f.path.startsWith("definition/"))).toBe(true);
    expect(SAMPLE_FILES.map((f) => f.path)).toEqual([...SAMPLE_FILES.map((f) => f.path)].sort());
  });
  it("lints to the same numbers as pbiplint --sample", () => {
    const { summary } = lint(SAMPLE_FILES);
    expect([summary.findings, summary.errors, summary.warnings, summary.infos]).toEqual([
      161, 16, 39, 106,
    ]);
  });
});
