import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { bindConfig, ConfigError, resolveConfig } from "../src/engine/config.js";
import { ignoreHelp, isIgnored } from "../src/engine/ignore.js";
import { lint } from "../src/engine/lint.js";
import { rank } from "../src/engine/rank.js";
import { optionsFor, runRules } from "../src/engine/run.js";
import { skippedLine } from "../src/format/text.js";
import { finding, namedObjects } from "../src/rules/helpers.js";
import { PARSE_ISSUE } from "../src/rules/parse-issue.js";
import { ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY } from "../src/rules/pbi-inspector/pages.js";
import { REMOVE_UNUSED_CUSTOM_VISUALS } from "../src/rules/pbi-inspector/report.js";
import { ENSURE_ALTTEXT } from "../src/rules/pbi-inspector/visuals.js";
import { REPORT_LEVEL_MEASURES } from "../src/rules/pbiplint/measures.js";
import type { Rule } from "../src/rules/types.js";
import { modelFrom } from "./helpers.js";

const base = {
  scope: [],
  description: "",
  references: [],
  status: "ported" as const,
  layer: "model" as const,
  needs: ["model"] as const,
};
const everyTable: Rule = {
  ...base,
  id: "EVERY_TABLE",
  name: "Every table",
  category: "Maintenance",
  severity: 1,
  check: ({ model }) => model!.tables.map((t) => finding.table(t)),
};
const everyColumn: Rule = {
  ...base,
  id: "EVERY_COLUMN",
  name: "Every column",
  category: "Formatting",
  severity: 2,
  check: ({ model }) => model!.tables.flatMap((t) => t.columns.map((c) => finding.column(c))),
};
const modelRule: Rule = {
  ...base,
  id: "MODEL_RULE",
  name: "Model",
  category: "Performance",
  severity: 2,
  check: ({ model }) => [finding.model(model!)],
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
  it("accepts a string $schema so editors can validate the file", () => {
    expect(() =>
      resolveConfig({ $schema: "https://pbiplint.com/schema/pbiplint.config.schema.json" }),
    ).not.toThrow();
  });
  it("rejects a $schema that is not a string", () => {
    expect(() => resolveConfig({ $schema: 1 })).toThrow(ConfigError);
    expect(() => resolveConfig({ $schema: 1 })).toThrow(/"\$schema" must be a string/);
    // The unknown-key check still runs first, so a typo is named before a bad $schema.
    expect(() => resolveConfig({ $schema: 1, rulez: {} })).toThrow(/unknown key "rulez"/);
  });
  it("accepts an object per rule with a severity and options, and keeps a v1 file valid", () => {
    const c = resolveConfig({
      rules: { A: { severity: "error", max: 15 }, B: { expect: "closed" }, C: "off", D: "warning" },
    });
    expect(c.severity.get("A")).toBe(3);
    expect(c.options.get("A")).toEqual({ max: 15 });
    expect(c.options.get("B")).toEqual({ expect: "closed" });
    expect(c.severity.has("B")).toBe(false);
    expect(c.disabled.has("C")).toBe(true);
    expect(c.options.has("D")).toBe(false);
    expect(() => resolveConfig({ rules: { A: { severity: "loud" } } })).toThrow(
      /rules\["A"\]\.severity/,
    );
    expect(() => resolveConfig({ rules: { A: [] } })).toThrow(ConfigError);
  });
});

describe("bindConfig with options", () => {
  const withMax: Rule = {
    ...base,
    id: "WITH_MAX",
    name: "With max",
    category: "Performance",
    severity: 2,
    options: [{ name: "max", type: "number", default: 20 }],
    check: () => [],
  };
  const policy: Rule = {
    ...base,
    id: "POLICY",
    name: "Policy",
    category: "Report Design",
    severity: 2,
    options: [{ name: "expect", type: "string", values: ["open", "closed"] }],
    check: () => [],
  };
  it("lays the config's values over the declared defaults, by id without regard to case", () => {
    const { config } = bindConfig(resolveConfig({ rules: { with_max: { max: 5 } } }), [
      withMax,
      policy,
    ]);
    expect(optionsFor(withMax, config)).toEqual({ max: 5 });
    expect(optionsFor(policy, config)).toEqual({});
    expect(optionsFor(withMax, resolveConfig())).toEqual({ max: 20 });
  });
  it("rejects an option the rule does not declare, a wrong type, and a value outside the list", () => {
    expect(() =>
      bindConfig(resolveConfig({ rules: { WITH_MAX: { maxx: 5 } } }), [withMax]),
    ).toThrow('pbiplint.config.json: rules["WITH_MAX"] has no option "maxx" (options: max)');
    expect(() =>
      bindConfig(resolveConfig({ rules: { WITH_MAX: { max: "5" } } }), [withMax]),
    ).toThrow('pbiplint.config.json: rules["WITH_MAX"].max must be a number');
    expect(() =>
      bindConfig(resolveConfig({ rules: { POLICY: { expect: "shut" } } }), [policy]),
    ).toThrow('pbiplint.config.json: rules["POLICY"].expect must be one of open, closed');
    expect(() =>
      bindConfig(resolveConfig({ rules: { EVERY_TABLE: { max: 1 } } }), [everyTable]),
    ).toThrow('pbiplint.config.json: rules["EVERY_TABLE"] takes no options');
  });
  it("names an unknown rule id once however many settings it carries", () => {
    expect(
      bindConfig(resolveConfig({ rules: { NOPE: { severity: "error", max: 1 } } }), [everyTable])
        .unknownRules,
    ).toEqual(["NOPE"]);
  });
  it("checks a values list on string options only", () => {
    const counted: Rule = {
      ...base,
      id: "COUNTED",
      name: "Counted",
      category: "Performance",
      severity: 2,
      options: [{ name: "n", type: "number", values: ["x"] }],
      check: () => [],
    };
    const { config } = bindConfig(resolveConfig({ rules: { COUNTED: { n: 5 } } }), [counted]);
    expect(optionsFor(counted, config)).toEqual({ n: 5 });
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
  it("matches ids regardless of case", () => {
    const lower = modelFrom(
      "table A\n\tcolumn X\n\t\tdataType: string\n\n\t\tannotation pbiplint.ignore = every_column\n",
    );
    expect(isIgnored(lower.tables[0]!.columns[0]!, "EVERY_COLUMN")).toBe(true);
  });
});

describe("ignoreHelp", () => {
  it("names the annotation and the config line for the rule", () => {
    expect(ignoreHelp("HIDE_FOREIGN_KEYS", ["Column"])).toBe(
      'To ignore this rule on one object, add `annotation pbiplint.ignore = HIDE_FOREIGN_KEYS` under the object in its TMDL file. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"HIDE_FOREIGN_KEYS": "off"` under `rules` in `pbiplint.config.json`.',
    );
    expect(ignoreHelp("X")).toBe(ignoreHelp("X", ["Model"]));
  });
  it("offers only the project switch for a rule that reports on files", () => {
    expect(ignoreHelp("PARSE_ISSUE", ["File"])).toBe(
      'This rule reports on files, so there is no object to annotate. To turn the rule off for a whole project, set `"PARSE_ISSUE": "off"` under `rules` in `pbiplint.config.json`.',
    );
  });
  it("tells a page or visual rule to annotate the JSON, and a report-level rule that there is nothing to annotate", () => {
    expect(ignoreHelp("ENSURE_ALTTEXT", ["Visual"])).toBe(
      'To ignore this rule on one visual, add `{ "name": "pbiplint.ignore", "value": "ENSURE_ALTTEXT" }` to the `annotations` array of its visual.json. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"ENSURE_ALTTEXT": "off"` under `rules` in `pbiplint.config.json`.',
    );
    expect(ignoreHelp("REDUCE_VISUALS_ON_PAGE", ["Page"])).toBe(
      'To ignore this rule on one page, add `{ "name": "pbiplint.ignore", "value": "REDUCE_VISUALS_ON_PAGE" }` to the `annotations` array of its page.json. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"REDUCE_VISUALS_ON_PAGE": "off"` under `rules` in `pbiplint.config.json`.',
    );
    // The words follow the annotatable types alone: a report-only type beside them changes nothing.
    expect(ignoreHelp("X", ["Page", "Report"])).toMatch(
      /^To ignore this rule on one page, .* of its page\.json\. /,
    );
    expect(ignoreHelp("X", ["Visual", "Bookmark"])).toMatch(
      /^To ignore this rule on one visual, .* of its visual\.json\. /,
    );
    expect(ignoreHelp("X", ["Visual", "Page", "Report", "Bookmark"])).toBe(
      'To ignore this rule on one page or visual, add `{ "name": "pbiplint.ignore", "value": "X" }` to the `annotations` array of its page.json or visual.json. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"X": "off"` under `rules` in `pbiplint.config.json`.',
    );
    expect(ignoreHelp("REDUCE_PAGES", ["Report"])).toBe(
      'This rule reports on the report itself, so there is no object to annotate. To turn the rule off for a whole project, set `"REDUCE_PAGES": "off"` under `rules` in `pbiplint.config.json`.',
    );
    // A report measure has an annotations array in the schema, but pbiplint reads none on it.
    expect(ignoreHelp("X", ["ReportMeasure"])).toBe(
      'This rule reports on measures defined in the report, and pbiplint reads no annotation on them, so there is no object to annotate. To turn the rule off for a whole project, set `"X": "off"` under `rules` in `pbiplint.config.json`.',
    );
    // Microsoft's bookmark schema has no place for an annotation.
    expect(ignoreHelp("BROKEN_BOOKMARK_REFERENCE", ["Bookmark"])).toBe(
      'This rule reports on bookmarks, and a bookmark\'s file has no place for an annotation, so there is no object to annotate. To turn the rule off for a whole project, set `"BROKEN_BOOKMARK_REFERENCE": "off"` under `rules` in `pbiplint.config.json`.',
    );
    expect(ignoreHelp("X", ["Report", "Bookmark"])).toMatch(
      /^This rule reports on the report itself/,
    );
    expect(ignoreHelp("X", ["Report", "ReportMeasure"])).toMatch(
      /^This rule reports on the report itself/,
    );
    // A rule that spans both layers keeps the TMDL form: its objects are model objects.
    expect(ignoreHelp("NOT_REACHED_FROM_REPORT", ["Column", "Measure"])).toMatch(
      /^To ignore this rule on one object, add `annotation/,
    );
  });
});

describe("runRules", () => {
  const m = modelFrom(tmdl);
  const idx = buildIndexes({ model: m });
  it("applies ignores, skips disabled and live-model rules, and survives a throwing rule", () => {
    const r = runRules(
      { model: m },
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
    const r = runRules({ model: m }, idx, [everyColumn], resolveConfig());
    expect(r.findings[0]).toEqual({
      ruleId: "EVERY_COLUMN",
      layer: "model",
      objectType: "Column",
      objectName: "'A'[Y]",
      location: { file: "inline.tmdl", line: 12 },
    });
  });
  it("skips a rule whose layer is not in the project and tags every finding with its object's layer", () => {
    const reportOnly: Rule = {
      ...base,
      id: "REPORT_ONLY",
      name: "Report only",
      category: "Report Design",
      severity: 2,
      layer: "report",
      needs: ["report"],
      check: () => [],
    };
    const m = modelFrom("table A\n\tcolumn X\n\t\tdataType: string\n");
    const r = runRules(
      { model: m },
      buildIndexes({ model: m }),
      [reportOnly, everyColumn],
      resolveConfig(),
    );
    expect(r.rulesSkipped).toEqual([{ id: "REPORT_ONLY", reason: "noReport" }]);
    expect(r.rulesRun).toEqual(["EVERY_COLUMN"]);
    expect(r.findings.map((f) => f.layer)).toEqual(["model"]);
  });
});

describe("rank", () => {
  it("orders by severity, then category, then count, then id", () => {
    const m = modelFrom(
      "table A\n\tcolumn X\n\t\tdataType: string\n\tcolumn Y\n\t\tdataType: string\n\ntable B\n\tcolumn Z\n\t\tdataType: string\n",
    );
    const rules = [everyTable, everyColumn, modelRule];
    const cfg = resolveConfig();
    const r = runRules({ model: m }, buildIndexes({ model: m }), rules, cfg);
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
    const groups = rank(
      runRules({ model: m }, buildIndexes({ model: m }), rules, cfg).findings,
      rules,
      cfg,
    );
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
  it("matches config rule ids regardless of case and reports the ones that match nothing", () => {
    const files = [{ path: "a.tmdl", text: "table A\n\tcolumn X\n\t\tdataType: string\n" }];
    const result = lint(files, {
      rules: [everyTable, everyColumn],
      config: {
        rules: {
          every_table: "off",
          Every_Column: "error",
          NOT_A_RULE: "off",
          also_missing: "warning",
        },
      },
    });
    expect(result.summary.rulesSkipped).toEqual([{ id: "EVERY_TABLE", reason: "disabled" }]);
    expect(result.groups.map((g) => [g.rule.id, g.rule.severity])).toEqual([["EVERY_COLUMN", 3]]);
    expect(result.summary.unknownRules).toEqual(["NOT_A_RULE", "also_missing"]);
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

describe("lint over a project", () => {
  const j = (v: unknown) => JSON.stringify(v);
  const modelFiles = [
    {
      path: "definition/tables/Sales.tmdl",
      text: "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n",
    },
  ];
  const reportFiles = [
    { path: "definition/report.json", text: j({}) },
    { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
    { path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "P" }) },
  ];
  it("reports which layers ran and why one is absent, and counts routed files", () => {
    const both = lint([...modelFiles, ...reportFiles, { path: "README.md", text: "" }]);
    expect(both.layers).toEqual({
      model: { present: true, files: 1 },
      report: { present: true, files: 3 },
    });
    expect(both.summary.files).toBe(4);
    expect(both.project.model).toBeDefined();
    expect(both.project.report).toBeDefined();
    expect(both.facts.map((f) => f.label)).toContain("Opens on");
    const modelOnly = lint(modelFiles);
    expect(modelOnly.layers.report).toEqual({ present: false, reason: "no report in the input" });
    expect(modelOnly.facts).toEqual([]);
    const reportOnly = lint(reportFiles, {
      absent: { model: "this report reads a published model" },
    });
    expect(reportOnly.layers.model).toEqual({
      present: false,
      reason: "this report reads a published model",
    });
    expect(reportOnly.model.tables).toEqual([]);
    expect(reportOnly.project.model).toBeUndefined();
    // The block rides with the report, so a report-only run keeps it; only the Model row is gone.
    expect(reportOnly.facts.map((f) => f.label)).toContain("Opens on");
    expect(reportOnly.facts.map((f) => f.label)).not.toContain("Model");
  });
  it("carries the reader's diagnostics and adds the builder's", () => {
    const r = lint(
      [
        ...reportFiles,
        {
          path: "definition/pages/q/page.json",
          text: j({ $schema: "https://x/page/9.0.0/schema.json", name: "q", displayName: "Q" }),
        },
      ],
      { diagnostics: [{ kind: "depth-cap", message: "stopped" }] },
    );
    expect(r.diagnostics.map((d) => d.kind)).toEqual(["depth-cap", "schema-newer-than-known"]);
  });
  it("skips model rules on a report-only run and says so", () => {
    const r = lint(reportFiles);
    expect(r.summary.rulesSkipped.filter((s) => s.reason === "noModel").length).toBeGreaterThan(60);
    expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
  });
  it("reports a JSON parse issue through PARSE_ISSUE with the file and line", () => {
    const r = lint([
      { path: "definition/pages/p/page.json", text: '{\n  "name": "p",\n<<<<<<< HEAD\n}\n' },
    ]);
    expect(
      r.findings
        .filter((f) => f.ruleId === "PARSE_ISSUE")
        .map((f) => [f.layer, f.objectName, f.location?.line, f.detail]),
    ).toEqual([
      ["report", "definition/pages/p/page.json", 3, "merge conflict marker: <<<<<<< HEAD"],
    ]);
  });
  it("reports a page.json or visual.json that is not a JSON object, and reads the rest", () => {
    const r = lint([
      { path: "definition/pages/p/page.json", text: '\n"Sales overview"\n' },
      {
        path: "definition/pages/p/visuals/v/visual.json",
        text: j({ name: "v", position: {}, visual: { visualType: "card" } }),
      },
      { path: "definition/pages/p/visuals/w/visual.json", text: "null" },
    ]);
    expect(
      r.findings
        .filter((f) => f.ruleId === "PARSE_ISSUE")
        .map((f) => [f.location?.file, f.location?.line, f.detail]),
    ).toEqual([
      [
        "definition/pages/p/page.json",
        2,
        'not a JSON object (the file holds a string): "Sales overview"',
      ],
      [
        "definition/pages/p/visuals/w/visual.json",
        1,
        "not a JSON object (the file holds null): null",
      ],
    ]);
    // As for invalid JSON, the visual that reads still sits under a stub page named by its folder.
    expect(
      r.project.report!.pages.map((p) => [p.id, p.displayName, p.visuals.map((v) => v.id)]),
    ).toEqual([["p", "p", ["v"]]]);
  });
  it("tags a parse-issue group that spans both layers as a project group", () => {
    const r = lint([
      { path: "definition/tables/Sales.tmdl", text: "table Sales\n  column Amount\n" },
      { path: "definition/pages/p/page.json", text: '{\n  "name": "p",\n<<<<<<< HEAD\n}\n' },
    ]);
    const group = r.groups.find((g) => g.rule.id === "PARSE_ISSUE")!;
    expect(group.rule.layer).toBe("project");
    expect(group.findings.map((f) => f.layer)).toEqual(["model", "report"]);
  });
  it("honours an ignore annotation in a page.json or visual.json, never in report.json", () => {
    const ignore = (value: string) => ({ annotations: [{ name: "pbiplint.ignore", value }] });
    const card = (name: string, extra: Record<string, unknown> = {}) => ({
      path: `definition/pages/p/visuals/${name}/visual.json`,
      text: j({
        name,
        position: { x: 0, y: 0, z: 0, height: 100, width: 100 },
        visual: { visualType: "card" },
        ...extra,
      }),
    });
    const r = lint(
      [
        {
          path: "definition/report.json",
          text: j({ publicCustomVisuals: ["chiclet"], ...ignore("*") }),
        },
        {
          path: "definition/pages/p/page.json",
          text: j({
            name: "p",
            displayName: "P",
            height: 1000,
            ...ignore("ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY"),
          }),
        },
        {
          path: "definition/pages/q/page.json",
          text: j({ name: "q", displayName: "Q", height: 1000 }),
        },
        card("v", ignore("*")),
        card("w"),
      ],
      {
        rules: [
          REMOVE_UNUSED_CUSTOM_VISUALS,
          ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY,
          ENSURE_ALTTEXT,
        ],
      },
    );
    // Report-level findings are switched off in config, so the report.json annotation silences nothing.
    expect(r.findings.map((f) => [f.ruleId, f.objectId])).toEqual([
      ["REMOVE_UNUSED_CUSTOM_VISUALS", "chiclet"],
      ["ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY", "q"],
      ["ENSURE_ALTTEXT", "w"],
    ]);
    expect(r.summary.ignored).toBe(2);
  });
  it("reads no ignore annotation on a report measure, though the schema allows one", () => {
    const r = lint(
      [
        // The model the report reads, without which the rule does not run.
        ...modelFiles,
        {
          path: "definition/reportExtensions.json",
          text: j({
            entities: [
              {
                name: "Sales",
                measures: [
                  {
                    name: "Net Margin",
                    expression: "1",
                    annotations: [{ name: "pbiplint.ignore", value: "REPORT_LEVEL_MEASURES" }],
                  },
                ],
              },
            ],
          }),
        },
      ],
      { rules: [REPORT_LEVEL_MEASURES] },
    );
    expect(r.findings.map((f) => [f.ruleId, f.objectId])).toEqual([
      ["REPORT_LEVEL_MEASURES", "Sales.Net Margin"],
    ]);
    expect(r.summary.ignored).toBe(0);
  });
  it("skips REPORT_LEVEL_MEASURES on a report that reads a published model", () => {
    const extensions = {
      path: "definition/reportExtensions.json",
      text: j({
        entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "1" }] }],
      }),
    };
    // pairingDecision gives this reason when definition.pbir connects to a published model, and
    // the CLI and the browser pass it to lint as the model's absence.
    const reportOnly = lint([...reportFiles, extensions], {
      absent: { model: "this report reads a published model" },
    });
    expect(reportOnly.findings.filter((f) => f.ruleId === "REPORT_LEVEL_MEASURES")).toEqual([]);
    expect(reportOnly.summary.rulesSkipped).toContainEqual({
      id: "REPORT_LEVEL_MEASURES",
      reason: "noModel",
    });
    // The skipped line carries the reason rules/report-level-measures.md quotes.
    expect(skippedLine(reportOnly)).toMatch(
      /\d+ rules skipped \(this report reads a published model\)/,
    );
    // With the model in the run, the same measure is reported.
    const both = lint([...modelFiles, ...reportFiles, extensions]);
    expect(
      both.findings.filter((f) => f.ruleId === "REPORT_LEVEL_MEASURES").map((f) => f.objectId),
    ).toEqual(["Sales.Net Margin"]);
  });
  it("links a fact to a rule only when the rule ran, so a rule turned off in config links nothing", () => {
    const files = [
      ...modelFiles,
      ...reportFiles,
      {
        path: "definition/pages/p/visuals/v/visual.json",
        text: j({
          name: "v",
          position: {},
          isHidden: true,
          visual: {
            visualType: "card",
            query: {
              queryState: {
                Values: {
                  projections: [
                    {
                      field: {
                        Column: {
                          Expression: { SourceRef: { Entity: "Sales" } },
                          Property: "Amount",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      },
      {
        path: "definition/reportExtensions.json",
        text: j({
          entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "1" }] }],
        }),
      },
    ];
    const fact = (label: string, config?: { rules: Record<string, "off"> }) =>
      lint(files, config ? { config } : {}).facts.find((f) => f.label === label);
    const measures = {
      layer: "report",
      label: "Report measures",
      value: "1",
      detail: "defined in the report, not the model",
    };
    const visuals = { layer: "report", label: "Visuals", value: "1", detail: "1 hidden" };
    // With every rule on, both facts link the rule that checks them.
    expect(fact("Report measures")).toEqual({ ...measures, ruleId: "REPORT_LEVEL_MEASURES" });
    expect(fact("Visuals")).toEqual({ ...visuals, ruleId: "HIDDEN_VISUAL_WITH_FIELDS" });
    // Turned off, the rule's page is not linked; the fact keeps its count, and the other its link.
    const off = (id: string) => ({ rules: { [id]: "off" as const } });
    expect(fact("Report measures", off("REPORT_LEVEL_MEASURES"))).toEqual(measures);
    expect(fact("Visuals", off("REPORT_LEVEL_MEASURES"))).toEqual({
      ...visuals,
      ruleId: "HIDDEN_VISUAL_WITH_FIELDS",
    });
    expect(fact("Visuals", off("HIDDEN_VISUAL_WITH_FIELDS"))).toEqual(visuals);
    expect(fact("Report measures", off("HIDDEN_VISUAL_WITH_FIELDS"))).toEqual({
      ...measures,
      ruleId: "REPORT_LEVEL_MEASURES",
    });
  });
  it("keeps an invalid-JSON detail on one line, whatever the engine's message spans", () => {
    const r = lint([{ path: "definition/pages/p/page.json", text: '{\n  "a": 1,\n  "b": }\n' }]);
    const issues = r.findings.filter((f) => f.ruleId === "PARSE_ISSUE");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.location?.line).toBe(3);
    expect(issues[0]!.detail).toMatch(/^not valid JSON \(/);
    expect(issues[0]!.detail).not.toContain("\n");
  });
});
