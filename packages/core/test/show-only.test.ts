import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { lint } from "../src/engine/lint.js";
import { showOnly } from "../src/engine/show-only.js";
import { formatJson, formatMarkdown, summaryLine } from "../src/format/index.js";

const files = [
  { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
  {
    path: "definition/tables/Sales.tmdl",
    text: "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n\tmeasure Total = SUM([Amount])\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
  },
];
const config = resolveConfig({ failOn: "info" });
const result = lint(files, { config });

describe("showOnly", () => {
  const [first, second] = result.groups;
  it("has a lint with at least two rules to choose between", () => {
    expect(second).toBeDefined();
  });

  it("keeps the given rules' groups and findings, counts them, and leaves the run's summary", () => {
    const kept = showOnly(result, [first!.rule.id], config);
    expect(kept.groups).toEqual([first]);
    expect(kept.findings.every((f) => f.ruleId === first!.rule.id)).toBe(true);
    expect(kept.findings).toHaveLength(first!.findings.length);
    const n = first!.findings.length;
    const sev = first!.rule.severity;
    expect(kept.summary.shown).toEqual({
      rules: [first!.rule.id],
      findings: n,
      errors: sev === 3 ? n : 0,
      warnings: sev === 2 ? n : 0,
      infos: sev === 1 ? n : 0,
    });
    expect({ ...kept.summary, shown: undefined }).toEqual({ ...result.summary, shown: undefined });
    expect(result.summary.shown).toBeUndefined();
  });

  it("fails only on what it keeps", () => {
    const strict = resolveConfig({ failOn: "error" });
    const loose = showOnly(result, [first!.rule.id], resolveConfig({ failOn: "none" }));
    expect(loose.failed).toBe(false);
    const kept = showOnly(result, [first!.rule.id], strict);
    expect(kept.failed).toBe(first!.rule.severity >= 3);
    expect(showOnly(result, [], config).failed).toBe(false);
  });

  it("says in the summary line, the Markdown, and the JSON that the run is filtered", () => {
    const kept = showOnly(result, [first!.rule.id, second!.rule.id], config);
    const n = first!.findings.length + second!.findings.length;
    expect(summaryLine(kept)).toMatch(
      new RegExp(`^${n} of ${result.summary.findings} findings? shown, 2 rules \\(`),
    );
    expect(summaryLine(result)).not.toContain("shown");
    expect(formatMarkdown(kept)).toContain(summaryLine(kept));
    expect(JSON.parse(formatJson(kept)).summary.shown.findings).toBe(n);
    expect(JSON.parse(formatJson(result)).summary.shown).toBeUndefined();
  });
});
