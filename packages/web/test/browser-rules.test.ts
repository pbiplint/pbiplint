import { defaultRules, lint, resolveConfig, skippedLine, type Rule } from "@pbiplint/core";
import { describe, expect, it, vi } from "vitest";
import { BROWSER_RULES, browserConfig } from "../src/browser-rules.js";
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

describe("browserConfig", () => {
  const unknownIn = (rules: Record<string, unknown>): string[] =>
    lint(SAMPLE_FILES, { config: browserConfig(resolveConfig({ rules })), rules: BROWSER_RULES })
      .summary.unknownRules;

  it("drops a left-out default rule's entries in any case, so they raise no notice", () => {
    // Bound as written, the entry names no rule the browser runs.
    const asWritten = resolveConfig({ rules: { NEEDS_THE_REPORT: "off" } });
    expect(
      lint(SAMPLE_FILES, { config: asWritten, rules: BROWSER_RULES }).summary.unknownRules,
    ).toEqual(["NEEDS_THE_REPORT"]);
    expect(unknownIn({ NEEDS_THE_REPORT: "off" })).toEqual([]);
    expect(unknownIn({ needs_the_report: "info" })).toEqual([]);
  });
  it("leaves a left-out rule's options unvalidated", () => {
    // The fixture declares no options, so bound against the default rules this entry throws.
    const rules = { Needs_The_Report: { severity: "error", max: 3 } };
    expect(() =>
      lint(SAMPLE_FILES, { config: resolveConfig({ rules }), rules: defaultRules }),
    ).toThrow(/takes no options/);
    expect(unknownIn(rules)).toEqual([]);
  });
  it("still names an id no default rule has", () => {
    expect(unknownIn({ NOPE: "off", needs_the_report: "off" })).toEqual(["NOPE"]);
  });
  it("keeps the entries for the rules the browser runs, and failOn", () => {
    const config = browserConfig(
      resolveConfig({
        rules: {
          hide_foreign_keys: "off",
          needs_the_report: "off",
          PARSE_ISSUE: "warning",
          NEEDS_THE_REPORT: "error",
        },
        failOn: "none",
      }),
    );
    expect([...config.disabled]).toEqual(["hide_foreign_keys"]);
    expect([...config.severity]).toEqual([["PARSE_ISSUE", 2]]);
    expect(config.failOn).toBeNull();
  });
});
