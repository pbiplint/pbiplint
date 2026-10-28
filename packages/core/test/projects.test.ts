import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { lint, type LintFile, type LintResult } from "../src/engine/lint.js";
import { runSummary, runSummaryLine, shareModels, type ProjectRun } from "../src/index.js";
import { defaultRules } from "../src/rules/index.js";
import type { Rule } from "../src/rules/types.js";
import { bound, j, measure, column, page } from "./report-helpers.js";

// One model, with two measures and a column nobody else uses, read by reports that each bind
// one field of it: Finance binds the measure A, Sales the column Amount.
const model: LintFile[] = [
  { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
  {
    path: "definition/tables/Sales.tmdl",
    text: "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n\tmeasure A = 1\n\tmeasure B = 2\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
  },
];
const report = (field: unknown): LintFile[] => [
  { path: "definition/report.json", text: j({}) },
  { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
  page("p"),
  bound("p", "v", "card", [field]),
];
const config = resolveConfig({ failOn: "info" });
const finance = await lint([...model, ...report(measure("Sales", "A"))], { config });
const sales = await lint([...model, ...report(column("Sales", "Amount"))], { config });

const run = (path: string, result: LintResult, extra: Partial<ProjectRun> = {}): ProjectRun => ({
  path,
  result,
  config,
  ...extra,
});
const counts = (r: LintResult) => {
  const n = (severity: number) =>
    r.groups.filter((g) => g.rule.severity === severity).reduce((k, g) => k + g.findings.length, 0);
  return { findings: r.findings.length, errors: n(3), warnings: n(2), infos: n(1) };
};
const notReached = (r: LintResult) =>
  r.findings.filter((f) => f.ruleId === "NOT_REACHED_FROM_REPORT").map((f) => f.objectName);

describe("shareModels", () => {
  it("leaves runs that share no model unchanged", () => {
    const apart = [
      run("a/A.pbip", finance, { modelKey: "m1" }),
      run("b/B.pbip", sales, { modelKey: "m2" }),
    ];
    expect(shareModels(apart)).toEqual(apart);
    const unkeyed = [run("a/A.pbip", finance), run("b/B.pbip", sales)];
    expect(shareModels(unkeyed)).toEqual(unkeyed);
  });

  it("lists a shared model's findings once, under the first run", () => {
    const [first, second] = shareModels([
      run("reports/Finance/Finance.pbip", finance, { modelKey: "m" }),
      run("reports/Sales/Sales.pbip", sales, { modelKey: "m" }),
    ]);
    // The sample has model findings and report findings in each run, or the test proves nothing.
    expect(sales.findings.some((f) => f.layer === "model")).toBe(true);
    expect(sales.findings.some((f) => f.layer === "report")).toBe(true);
    const s = second!.result;
    expect(s.findings.filter((f) => f.layer === "model")).toEqual([]);
    expect(s.findings).toEqual(sales.findings.filter((f) => f.layer === "report"));
    expect(s.groups.flatMap((g) => g.findings)).toHaveLength(s.findings.length);
    expect(s.groups.every((g) => g.findings.length > 0)).toBe(true);
    const { findings, errors, warnings, infos } = s.summary;
    expect({ findings, errors, warnings, infos }).toEqual(counts(s));
    expect(s.failed).toBe(s.groups.length > 0);
    expect(first!.result.findings.filter((f) => f.layer === "model").length).toBeGreaterThan(0);
    expect(first!.result.diagnostics.at(-1)).toEqual({
      kind: "shared-model",
      message:
        "the model is shared with reports/Sales/Sales.pbip; NOT_REACHED_FROM_REPORT counts a field as reached when any of these reports reaches it",
    });
    expect(s.diagnostics.at(-1)).toEqual({
      kind: "shared-model",
      message:
        "the model is shared with reports/Finance/Finance.pbip; its findings are listed there",
    });
    // The input is not changed.
    expect(sales.findings.some((f) => f.layer === "model")).toBe(true);
  });

  it("keeps NOT_REACHED_FROM_REPORT only where no sharing report reaches the field", () => {
    expect(notReached(finance)).toEqual(["[B]", "'Sales'[Amount]"]);
    expect(notReached(sales)).toEqual(["[A]", "[B]"]);
    const [first, second] = shareModels([
      run("reports/Finance/Finance.pbip", finance, { modelKey: "m" }),
      run("reports/Sales/Sales.pbip", sales, { modelKey: "m" }),
    ]);
    expect(notReached(first!.result)).toEqual(["[B]"]);
    expect(notReached(second!.result)).toEqual([]);
    const { findings, errors, warnings, infos } = first!.result.summary;
    expect({ findings, errors, warnings, infos }).toEqual(counts(first!.result));
  });

  it("lists a rule that could not finish on the shared model once, under the first run", async () => {
    const WHOLE: Rule = {
      id: "WHOLE",
      name: "Test rule",
      category: "Maintenance",
      severity: 2,
      scope: [],
      description: "",
      references: [],
      status: "ported",
      layer: "model",
      needs: ["model"],
      check: () => {
        throw new Error("a message");
      },
    };
    const rules = [...defaultRules, WHOLE];
    const a = await lint([...model, ...report(measure("Sales", "A"))], { config, rules });
    const b = await lint([...model, ...report(column("Sales", "Amount"))], { config, rules });
    expect(b.summary.ruleErrors).toEqual([{ id: "WHOLE", message: "Error" }]);
    const [first, second] = shareModels([
      run("a/A.pbip", a, { modelKey: "m" }),
      run("b/B.pbip", b, { modelKey: "m" }),
    ]);
    expect(first!.result.summary.ruleErrors).toEqual([{ id: "WHOLE", message: "Error" }]);
    expect(second!.result.summary.ruleErrors).toEqual([]);
    expect(second!.result.findings.some((f) => f.ruleId === "RULE_COULD_NOT_FINISH")).toBe(false);
  });

  it("says which config a shared model's findings follow when the configs differ", () => {
    const [first] = shareModels([
      run("a/A.pbip", finance, { modelKey: "m", configPath: "a/pbiplint.config.json" }),
      run("b/B.pbip", sales, { modelKey: "m", configPath: "b/pbiplint.config.json" }),
    ]);
    expect(first!.result.diagnostics.at(-1)!.message).toMatch(
      /; its findings follow a\/pbiplint\.config\.json$/,
    );
    const [same] = shareModels([
      run("a/A.pbip", finance, { modelKey: "m", configPath: "pbiplint.config.json" }),
      run("b/B.pbip", sales, { modelKey: "m", configPath: "pbiplint.config.json" }),
    ]);
    expect(same!.result.diagnostics.at(-1)!.message).not.toContain("its findings follow");
  });
});

/** A result with only the summary and layers `runSummary` reads, for counting. */
function counted(
  files: { model?: number; report?: number },
  summary: Partial<LintResult["summary"]> = {},
): LintResult {
  const layer = (n: number | undefined) =>
    n === undefined
      ? ({ present: false, reason: "" } as const)
      : ({ present: true, files: n } as const);
  return {
    ...finance,
    layers: { model: layer(files.model), report: layer(files.report) },
    summary: {
      ...finance.summary,
      files: (files.model ?? 0) + (files.report ?? 0),
      findings: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
      ignored: 0,
      ruleErrors: [],
      ...summary,
    },
  };
}

describe("runSummary", () => {
  it("adds up the runs and counts a shared model's files once", () => {
    const s = runSummary([
      run(
        "a/A.pbip",
        counted({ model: 10, report: 5 }, { findings: 3, errors: 1, warnings: 2, ignored: 1 }),
        { modelKey: "m" },
      ),
      run("b/B.pbip", counted({ model: 10, report: 7 }, { findings: 4, infos: 4, ignored: 2 }), {
        modelKey: "m",
      }),
    ]);
    expect(s).toEqual({
      projects: 2,
      files: 22,
      findings: 7,
      errors: 1,
      warnings: 2,
      infos: 4,
      ignored: 3,
      ruleErrors: 0,
    });
  });

  it("counts each run's rules that could not finish, and sums what each run shows", () => {
    const s = runSummary([
      run(
        "a/A.pbip",
        counted(
          { model: 4 },
          {
            findings: 9,
            ruleErrors: [
              { id: "X", message: "TypeError" },
              { id: "X", message: "query 'q': TypeError" },
            ],
            shown: { rules: ["X", "Y"], findings: 2, errors: 1, warnings: 1, infos: 0 },
          },
        ),
      ),
      run(
        "b/B.pbip",
        counted(
          { report: 3 },
          {
            findings: 5,
            ruleErrors: [{ id: "Y", message: "TypeError" }],
            shown: { rules: ["Y"], findings: 1, errors: 0, warnings: 0, infos: 1 },
          },
        ),
      ),
    ]);
    expect(s.ruleErrors).toBe(2);
    expect(s.shown).toEqual({ rules: ["X", "Y"], findings: 3, errors: 1, warnings: 1, infos: 1 });
  });
});

describe("runSummaryLine", () => {
  const base = {
    projects: 3,
    files: 212,
    findings: 41,
    errors: 3,
    warnings: 30,
    infos: 8,
    ignored: 0,
    ruleErrors: 0,
  };
  it("names the projects in front of summaryLine's counts", () => {
    expect(runSummaryLine(base)).toBe(
      "3 projects, 41 findings (3 errors, 30 warnings, 8 info) in 212 files",
    );
  });
  it("says how many rules could not finish, as summaryLine does", () => {
    expect(runSummaryLine({ ...base, ruleErrors: 2 })).toBe(
      "3 projects, 41 findings (3 errors, 30 warnings, 8 info) in 212 files, 2 rules could not finish",
    );
    expect(runSummaryLine({ ...base, ruleErrors: 1 })).toMatch(/, 1 rule could not finish$/);
  });
  it("says what a filtered run shows, as summaryLine does", () => {
    expect(
      runSummaryLine({
        ...base,
        shown: { rules: ["A"], findings: 5, errors: 5, warnings: 0, infos: 0 },
      }),
    ).toBe(
      "3 projects, 5 of 41 findings shown, 1 rule (5 errors, 0 warnings, 0 info) in 212 files",
    );
  });
});
