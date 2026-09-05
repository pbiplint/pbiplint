import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { ConfigError, resolveConfig } from "../src/engine/config.js";
import { isIgnored } from "../src/engine/ignore.js";
import { lint } from "../src/engine/lint.js";
import { rank } from "../src/engine/rank.js";
import { runRules } from "../src/engine/run.js";
import { finding, namedObjects } from "../src/rules/helpers.js";
import { PARSE_ISSUE } from "../src/rules/parse-issue.js";
import type { Rule } from "../src/rules/types.js";
import { modelFrom } from "./helpers.js";

const base = { scope: [], description: "", references: [], status: "ported" as const };
const everyTable: Rule = {
  ...base,
  id: "EVERY_TABLE",
  name: "Every table",
  category: "Maintenance",
  severity: 1,
  check: (m) => m.tables.map((t) => finding.table(t)),
};
const everyColumn: Rule = {
  ...base,
  id: "EVERY_COLUMN",
  name: "Every column",
  category: "Formatting",
  severity: 2,
  check: (m) => m.tables.flatMap((t) => t.columns.map((c) => finding.column(c))),
};
const modelRule: Rule = {
  ...base,
  id: "MODEL_RULE",
  name: "Model",
  category: "Performance",
  severity: 2,
  check: (m) => [finding.model(m)],
};
const live: Rule = {
  ...base,
  id: "LIVE",
  name: "Live",
  category: "Performance",
  severity: 2,
  status: "needsLiveModel",
  check: () => [],
};
const boom: Rule = {
  ...base,
  id: "BOOM",
  name: "Boom",
  category: "Performance",
  severity: 3,
  check: () => {
    throw new Error("kaboom");
  },
};

const tmdl =
  'model Model\n\tculture: en-US\n\nannotation pbiplint.ignore = MODEL_RULE\n\ntable A\n\tcolumn X\n\t\tdataType: string\n\n\t\tannotation pbiplint.ignore = "EVERY_COLUMN, OTHER"\n\n\tcolumn Y\n\t\tdataType: string\n\ntable B\n\tannotation pbiplint.ignore = *\n\n\tcolumn Z\n\t\tdataType: string\n';

describe("resolveConfig", () => {
  it("defaults to failing on errors with nothing disabled", () => {
    const c = resolveConfig(undefined);
    expect(c.failOn).toBe(3);
    expect(c.disabled.size).toBe(0);
    expect(c.severity.size).toBe(0);
  });
  it("reads rule switches, severity overrides, and failOn", () => {
    const c = resolveConfig({ rules: { A: "off", B: "error", C: "info" }, failOn: "warning" });
    expect([...c.disabled]).toEqual(["A"]);
    expect(c.severity.get("B")).toBe(3);
    expect(c.severity.get("C")).toBe(1);
    expect(c.failOn).toBe(2);
    expect(resolveConfig({ failOn: "none" }).failOn).toBeNull();
  });
  it("rejects bad shapes with a readable message", () => {
    expect(() => resolveConfig({ rules: { A: "loud" } })).toThrow(ConfigError);
    expect(() => resolveConfig({ failOn: "sometimes" })).toThrow(/failOn/);
    expect(() => resolveConfig({ rulez: {} })).toThrow(/unknown key "rulez"/);
    expect(() => resolveConfig([])).toThrow(ConfigError);
  });
});

describe("isIgnored", () => {
  const m = modelFrom(tmdl);
  it("matches listed ids, wildcards, and quoted values", () => {
    expect(isIgnored(m, "MODEL_RULE")).toBe(true);
    expect(isIgnored(m, "OTHER")).toBe(false);
    expect(isIgnored(m.tables[0]!.columns[0]!, "EVERY_COLUMN")).toBe(true);
    expect(isIgnored(m.tables[0]!.columns[0]!, "OTHER")).toBe(true);
    expect(isIgnored(m.tables[0]!.columns[1]!, "EVERY_COLUMN")).toBe(false);
    expect(isIgnored(m.tables[1]!, "ANYTHING")).toBe(true);
    expect(isIgnored(undefined, "ANYTHING")).toBe(false);
  });
});

describe("runRules", () => {
  const m = modelFrom(tmdl);
  const idx = buildIndexes(m);
  it("applies ignores, skips disabled and live-model rules, and survives a throwing rule", () => {
    const r = runRules(
      m,
      idx,
      [everyTable, everyColumn, modelRule, live, boom],
      resolveConfig({ rules: { EVERY_TABLE: "off" } }),
    );
    // 'A'[X] is ignored by its own annotation; the model ignores MODEL_RULE; 'B'[Z] has no annotation
    // of its own (table-level ignores do not cascade to columns), so it is reported.
    expect(r.findings.map((f) => `${f.ruleId} ${f.objectName}`)).toEqual([
      "EVERY_COLUMN 'A'[Y]",
      "EVERY_COLUMN 'B'[Z]",
    ]);
    expect(r.ignored).toBe(2);
    expect(r.rulesRun).toEqual(["EVERY_COLUMN", "MODEL_RULE", "BOOM"]);
    expect(r.rulesSkipped).toEqual([
      { id: "EVERY_TABLE", reason: "disabled" },
      { id: "LIVE", reason: "needsLiveModel" },
    ]);
    expect(r.ruleErrors).toEqual([{ id: "BOOM", message: "kaboom" }]);
  });
  it("stamps ruleId and drops the object reference", () => {
    const r = runRules(m, idx, [everyColumn], resolveConfig());
    expect(r.findings[0]).toEqual({
      ruleId: "EVERY_COLUMN",
      objectType: "Column",
      objectName: "'A'[Y]",
      location: { file: "inline.tmdl", line: 12 },
    });
  });
});

describe("rank", () => {
  it("orders by severity, then category, then count, then id", () => {
    const m = modelFrom(
      "table A\n\tcolumn X\n\t\tdataType: string\n\tcolumn Y\n\t\tdataType: string\n\ntable B\n\tcolumn Z\n\t\tdataType: string\n",
    );
    const rules = [everyTable, everyColumn, modelRule];
    const cfg = resolveConfig();
    const r = runRules(m, buildIndexes(m), rules, cfg);
    const groups = rank(r.findings, rules, cfg);
    expect(groups.map((g) => [g.rule.id, g.findings.length])).toEqual([
      ["MODEL_RULE", 1], // warning, Performance
      ["EVERY_COLUMN", 3], // warning, Formatting
      ["EVERY_TABLE", 2], // info
    ]);
    expect(groups[0]!.rule).toMatchObject({
      severity: 2,
      slug: "model-rule",
      url: "https://pbiplint.com/rules/model-rule",
      category: "Performance",
    });
  });
  it("uses the configured severity override", () => {
    const m = modelFrom("table A\n");
    const rules = [everyTable, modelRule];
    const cfg = resolveConfig({ rules: { EVERY_TABLE: "error" } });
    const groups = rank(runRules(m, buildIndexes(m), rules, cfg).findings, rules, cfg);
    expect(groups.map((g) => [g.rule.id, g.rule.severity])).toEqual([
      ["EVERY_TABLE", 3],
      ["MODEL_RULE", 2],
    ]);
  });
});

describe("lint", () => {
  it("parses, runs, ranks, and reports parse issues as findings", () => {
    const files = [
      { path: "definition/model.tmdl", text: "model Model\n" },
      {
        path: "definition/tables/A.tmdl",
        text: "table A\n    column Bad\n\tcolumn X\n\t\tdataType: string\n",
      },
    ];
    const result = lint(files, { rules: [PARSE_ISSUE, everyColumn] });
    expect(result.summary).toMatchObject({
      files: 2,
      findings: 2,
      errors: 1,
      warnings: 1,
      infos: 0,
      rulesRun: 2,
      ignored: 0,
    });
    expect(result.groups[0]!.rule.id).toBe("PARSE_ISSUE");
    expect(result.groups[0]!.findings[0]).toMatchObject({
      objectType: "File",
      objectName: "definition/tables/A.tmdl",
      location: { file: "definition/tables/A.tmdl", line: 2 },
    });
    expect(result.failed).toBe(true);
    expect(lint(files, { rules: [everyColumn] }).failed).toBe(false);
    expect(lint(files, { rules: [everyColumn], config: { failOn: "warning" } }).failed).toBe(true);
    expect(lint(files, { rules: [everyColumn], config: { failOn: "none" } }).failed).toBe(false);
  });
  it("uses the default rule set when none is given", () => {
    const result = lint([{ path: "a.tmdl", text: "table A\n" }]);
    expect(result.summary.rulesRun).toBeGreaterThanOrEqual(1);
  });
});

describe("namedObjects", () => {
  it("enumerates objects by scope with their finding shells", () => {
    const m = modelFrom(
      "table A\n\tcolumn X\n\t\tdataType: string\n\tcolumn C = 1\n\tmeasure M = 1\n\thierarchy H\n\t\tlevel L\n\t\t\tcolumn: X\n\tpartition A = m\n\t\tmode: import\n\t\tsource = 1\n\nrole R\n\tmodelPermission: read\n\ttablePermission A = 1 = 1\n\nperspective P\n\nexpression E = 1\n",
    );
    const names = (types: Parameters<typeof namedObjects>[1]) =>
      namedObjects(m, types).map((o) => `${o.finding.objectType}:${o.name}`);
    expect(
      names([
        "Model",
        "Table",
        "Column",
        "CalculatedColumn",
        "Measure",
        "Hierarchy",
        "Level",
        "Partition",
        "Role",
        "TablePermission",
        "Perspective",
        "NamedExpression",
      ]),
    ).toEqual([
      "Model:Model",
      "Table:A",
      "Column:X",
      "CalculatedColumn:C",
      "Measure:M",
      "Hierarchy:H",
      "Level:L",
      "Partition:A",
      "Role:R",
      "TablePermission:A",
      "Perspective:P",
      "NamedExpression:E",
    ]);
    expect(
      names([
        "CalculatedTable",
        "CalculationGroupTable",
        "CalculatedTableColumn",
        "CalculationItem",
        "DataSource",
        "Relationship",
      ]),
    ).toEqual([]);
  });
});
