import { defaultRules, lint, skippedLine, type Rule } from "@pbiplint/core";
import { describe, expect, it, vi } from "vitest";
import { BROWSER_RULES } from "../src/browser-rules.js";
import { SAMPLE_FILES } from "../src/sample.js";

// No registered rule needs the report until the ports land, so the default rules this file sees
// are a copy with one such rule appended: the filter is exercised now, not from Task 15 on.
const { REPORT_RULE } = vi.hoisted(() => {
  const REPORT_RULE: Rule = {
    id: "NEEDS_THE_REPORT",
    name: "Stands in for a rule that needs the report",
    category: "Report Design",
    severity: 2,
    scope: ["Report"],
    layer: "report",
    needs: ["report"],
    description: "A fixture rule for the browser's rule gate.",
    references: [],
    status: "builtin",
    check: () => [],
  };
  return { REPORT_RULE };
});

vi.mock("@pbiplint/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@pbiplint/core")>();
  return { ...core, defaultRules: [...core.defaultRules, REPORT_RULE] };
});

const needsReport = (r: Rule): boolean => r.needs.includes("report");
const ids = (rules: Rule[]): string[] => rules.map((r) => r.id);

describe("BROWSER_RULES", () => {
  it("holds no rule that needs the report", () => {
    expect(defaultRules).toContain(REPORT_RULE);
    expect(ids(BROWSER_RULES.filter(needsReport))).toEqual([]);
  });
  it("holds every default rule that does not, in order, so nothing else is dropped", () => {
    expect(ids(BROWSER_RULES)).toEqual(ids(defaultRules.filter((r) => !needsReport(r))));
  });
  it("lints the sample model without skipping rules for a report the browser cannot read", () => {
    // The default rules would skip the fixture, which is the sentence the gate keeps off the page.
    expect(skippedLine(lint(SAMPLE_FILES, { rules: defaultRules }))).toMatch(
      /skipped \(no report in the input\)/,
    );
    expect(skippedLine(lint(SAMPLE_FILES, { rules: BROWSER_RULES }))).not.toMatch(
      /no report in the input/,
    );
  });
});
