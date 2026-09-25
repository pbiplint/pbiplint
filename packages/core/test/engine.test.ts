import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { bindConfig, ConfigError, resolveConfig } from "../src/engine/config.js";
import { ignoreHelp, isIgnored } from "../src/engine/ignore.js";
import { lint } from "../src/engine/lint.js";
import { rank } from "../src/engine/rank.js";
import { optionsFor, runRules } from "../src/engine/run.js";
import { buildReport } from "../src/pbir/build.js";
import { skippedLine } from "../src/format/text.js";
import { finding, modelPartlyRead, namedObjects } from "../src/rules/helpers.js";
import { PARSE_ISSUE } from "../src/rules/parse-issue.js";
import { ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY } from "../src/rules/pbi-inspector/pages.js";
import { REMOVE_UNUSED_CUSTOM_VISUALS } from "../src/rules/pbi-inspector/report.js";
import { ENSURE_ALTTEXT } from "../src/rules/pbi-inspector/visuals.js";
import { defaultRules } from "../src/rules/index.js";
import { REPORT_LEVEL_MEASURES } from "../src/rules/pbiplint/measures.js";
import { customVisualUseUnknown, fieldFileUnread } from "../src/rules/report-helpers.js";
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
    expect(() => resolveConfig({ rules: ["A"] })).toThrow(
      'pbiplint.config.json: "rules" must be an object of rule id to "off", "info", "warning", "error", or an object with a severity and options',
    );
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
  it("skips a rule when a report file its skipWhenUnread names could not be read, and runs the rest", () => {
    const both = { ...base, layer: "project" as const, needs: ["model", "report"] as const };
    const wholeReport: Rule = {
      ...both,
      id: "WHOLE_REPORT",
      name: "Whole report",
      category: "Maintenance",
      severity: 1,
      skipWhenUnread: fieldFileUnread,
      check: ({ model }) => [finding.model(model!)],
    };
    const anyReport: Rule = {
      ...both,
      id: "ANY_REPORT",
      name: "Any report",
      category: "Maintenance",
      severity: 1,
      check: ({ model }) => [finding.model(model!)],
    };
    const m = modelFrom("table A\n\tcolumn X\n\t\tdataType: string\n");
    const run = (files: { path: string; text: string }[], withModel = true) => {
      const project = { ...(withModel ? { model: m } : {}), report: buildReport(files).report };
      return runRules(project, buildIndexes(project), [wholeReport, anyReport], resolveConfig());
    };
    const page = { path: "definition/pages/p/page.json", text: '{ "name": "p" }' };
    const broken = run([page, { path: "definition/pages/p/visuals/v/visual.json", text: "{" }]);
    expect(broken.rulesSkipped).toEqual([{ id: "WHOLE_REPORT", reason: "reportFileUnread" }]);
    expect(broken.rulesRun).toEqual(["ANY_REPORT"]);
    expect(broken.findings.map((f) => f.ruleId)).toEqual(["ANY_REPORT"]);
    // Every file read: both run.
    expect(run([page]).rulesRun).toEqual(["WHOLE_REPORT", "ANY_REPORT"]);
    // A file the PBIR format does not define, and the report's .platform, do not count.
    expect(run([page, { path: "definition/notes.json", text: "{" }]).rulesRun).toEqual([
      "WHOLE_REPORT",
      "ANY_REPORT",
    ]);
    expect(run([page, { path: ".platform", text: "{" }]).rulesRun).toEqual([
      "WHOLE_REPORT",
      "ANY_REPORT",
    ]);
    // Nor does a file the predicate leaves out: pages.json holds no field reference.
    expect(run([page, { path: "definition/pages/pages.json", text: "{" }]).rulesRun).toEqual([
      "WHOLE_REPORT",
      "ANY_REPORT",
    ]);
    // A missing layer is the reason the reader needs first: with no model, nothing was compared.
    expect(run([page, { path: "definition/report.json", text: "[]" }], false).rulesSkipped).toEqual(
      [
        { id: "WHOLE_REPORT", reason: "noModel" },
        { id: "ANY_REPORT", reason: "noModel" },
      ],
    );
  });
  it("skips a rule when its skipWhenModelUnread holds, after the report's reason and a missing layer's", () => {
    const both = { ...base, layer: "project" as const, needs: ["model", "report"] as const };
    const wholeProject: Rule = {
      ...both,
      id: "WHOLE_PROJECT",
      name: "Whole project",
      category: "Maintenance",
      severity: 1,
      skipWhenUnread: fieldFileUnread,
      skipWhenModelUnread: modelPartlyRead,
      check: ({ model }) => [finding.model(model!)],
    };
    const wholeModel: Rule = { ...wholeProject, id: "WHOLE_MODEL", skipWhenUnread: undefined };
    const page = { path: "definition/pages/p/page.json", text: '{ "name": "p" }' };
    const run = (tmdl: string, reportFiles = [page], withReport = true) => {
      const model = modelFrom(tmdl);
      const project = { model, ...(withReport ? { report: buildReport(reportFiles).report } : {}) };
      return runRules(project, buildIndexes(project), [wholeProject, wholeModel], resolveConfig());
    };
    const read = "table A\n\tcolumn X\n\t\tdataType: string\n";
    // A line indented with spaces takes what it declares out of the model.
    const partly = `${read}    column Y\n`;
    expect(run(read).rulesRun).toEqual(["WHOLE_PROJECT", "WHOLE_MODEL"]);
    expect(run(partly).rulesSkipped).toEqual([
      { id: "WHOLE_PROJECT", reason: "modelFileUnread" },
      { id: "WHOLE_MODEL", reason: "modelFileUnread" },
    ]);
    // Both conditions: the report's reason, checked first, is the one given.
    const unreadVisual = { path: "definition/pages/p/visuals/v/visual.json", text: "{" };
    expect(run(partly, [page, unreadVisual]).rulesSkipped).toEqual([
      { id: "WHOLE_PROJECT", reason: "reportFileUnread" },
      { id: "WHOLE_MODEL", reason: "modelFileUnread" },
    ]);
    expect(run(partly, [page], false).rulesSkipped).toEqual([
      { id: "WHOLE_PROJECT", reason: "noReport" },
      { id: "WHOLE_MODEL", reason: "noReport" },
    ]);
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
  it("reports a TMDL object at the root whose type TMDL does not declare there through PARSE_ISSUE", () => {
    const r = lint([
      {
        path: "definition/tables/Sales.tmdl",
        text: "tabel Sales\n\tcolumn Amount\n\t\tdataType: decimal\n",
      },
    ]);
    expect(
      r.findings
        .filter((f) => f.ruleId === "PARSE_ISSUE")
        .map((f) => [f.layer, f.objectName, f.location?.line, f.detail]),
    ).toEqual([
      [
        "model",
        "definition/tables/Sales.tmdl",
        1,
        '"tabel" is not a type TMDL declares at the root of a file: tabel Sales',
      ],
    ]);
    // Nothing under the declaration reaches the model, as before.
    expect(r.model.tables).toEqual([]);
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
  describe("NOT_REACHED_FROM_REPORT with a report file that could not be read", () => {
    // A readable visual naming Sales[Region], which the model does not have, beside the files each
    // case adds. Amount is bound nowhere, so with every file read the rule reports it.
    const regionCard = {
      path: "definition/pages/p/visuals/r/visual.json",
      text: j({
        name: "r",
        position: {},
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
                        Property: "Region",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    };
    /** Lints the project with the extra files, each taking the place of a file at its path. */
    const run = (...extra: { path: string; text: string }[]) => {
      const kept = [...modelFiles, ...reportFiles, regionCard].filter(
        (f) => !extra.some((e) => e.path === f.path),
      );
      const r = lint([...kept, ...extra]);
      const ids = (id: string) =>
        r.findings.filter((f) => f.ruleId === id).map((f) => f.objectId ?? f.objectName);
      return { r, ids };
    };
    const skipped = { id: "NOT_REACHED_FROM_REPORT", reason: "reportFileUnread" };
    it("reports what is not reached when every report file was read", () => {
      const { r, ids } = run();
      expect(ids("NOT_REACHED_FROM_REPORT")).toEqual(["'Sales'[Amount]"]);
      expect(r.summary.rulesSkipped).not.toContainEqual(skipped);
    });
    it("is skipped with the reason when a visual.json is invalid JSON, while BROKEN_FIELD_REFERENCE runs", () => {
      const { r, ids } = run({
        path: "definition/pages/p/visuals/v/visual.json",
        text: '{\n  "name": "v",\n  "visual": {\n',
      });
      expect(r.summary.rulesSkipped).toContainEqual(skipped);
      expect(ids("NOT_REACHED_FROM_REPORT")).toEqual([]);
      // A broken reference in a file that was read is broken whatever the unread file says.
      expect(ids("BROKEN_FIELD_REFERENCE")).toEqual(["r"]);
      expect(ids("PARSE_ISSUE")).toEqual(["definition/pages/p/visuals/v/visual.json"]);
      // The report registers no custom visual, so the unread visual cannot change what
      // REMOVE_UNUSED_CUSTOM_VISUALS says, and it runs.
      expect(skippedLine(r)).toContain("1 rule skipped (a report file could not be read)");
    });
    it("is skipped with the reason when reportExtensions.json holds merge-conflict markers", () => {
      const side = (expression: string) =>
        j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression }] }] });
      const { r, ids } = run({
        path: "definition/reportExtensions.json",
        text: [
          "<<<<<<< HEAD",
          side("SUM('Sales'[Amount])"),
          "=======",
          side("1"),
          ">>>>>>> main",
        ].join("\n"),
      });
      expect(r.summary.rulesSkipped).toContainEqual(skipped);
      expect(ids("NOT_REACHED_FROM_REPORT")).toEqual([]);
      expect(r.summary.rulesSkipped.map((s) => s.id)).not.toContain("BROKEN_FIELD_REFERENCE");
      expect(ids("BROKEN_FIELD_REFERENCE")).toEqual(["r"]);
    });
    it("runs when the file that could not be read is the author's own or the report's .platform", () => {
      for (const file of [
        { path: "definition/notes/owners.json", text: '["alice",]' },
        { path: ".platform", text: '{\n  "metadata": {\n' },
      ]) {
        const { r, ids } = run(file);
        expect(ids("PARSE_ISSUE"), file.path).toEqual([file.path]);
        expect(r.summary.rulesSkipped, file.path).not.toContainEqual(skipped);
        expect(ids("NOT_REACHED_FROM_REPORT"), file.path).toEqual(["'Sales'[Amount]"]);
      }
    });
    it("is skipped when report.json, a page.json, or a bookmark file could not be read, each a file it reads fields from", () => {
      for (const file of [
        { path: "definition/report.json", text: '{\n  "filterConfig": {\n' },
        { path: "definition/pages/p/page.json", text: "<<<<<<< HEAD\n{}\n" },
        { path: "definition/bookmarks/b.bookmark.json", text: "[]" },
      ]) {
        const { r, ids } = run(file);
        expect(r.summary.rulesSkipped, file.path).toContainEqual(skipped);
        expect(ids("NOT_REACHED_FROM_REPORT"), file.path).toEqual([]);
        expect(ids("PARSE_ISSUE"), file.path).toEqual([file.path]);
      }
    });
    it("runs when version.json, pages.json, bookmarks.json, or a mobile.json could not be read, since none holds a field reference", () => {
      for (const file of [
        { path: "definition/version.json", text: "{" },
        { path: "definition/pages/pages.json", text: "<<<<<<< HEAD\n{}\n" },
        { path: "definition/bookmarks/bookmarks.json", text: '{ "items": [' },
        { path: "definition/pages/p/visuals/r/mobile.json", text: "[]" },
      ]) {
        const { r, ids } = run(file);
        expect(ids("PARSE_ISSUE"), file.path).toEqual([file.path]);
        expect(r.summary.rulesSkipped, file.path).not.toContainEqual(skipped);
        expect(ids("NOT_REACHED_FROM_REPORT"), file.path).toEqual(["'Sales'[Amount]"]);
        expect(skippedLine(r), file.path).not.toContain("a report file could not be read");
      }
    });
    it("is the only rule an unread file of the report's field references stops, and REMOVE_UNUSED_CUSTOM_VISUALS the only one an unread visual.json does", () => {
      expect(
        defaultRules.filter((r) => r.skipWhenUnread).map((r) => [r.id, r.skipWhenUnread]),
      ).toEqual([
        ["REMOVE_UNUSED_CUSTOM_VISUALS", customVisualUseUnknown],
        ["NOT_REACHED_FROM_REPORT", fieldFileUnread],
      ]);
    });
  });
  describe("NOT_REACHED_FROM_REPORT on a model pbiplint could not fully read", () => {
    // Base is used only by Doubled's DAX, and nothing in the report binds either. Doubled's line
    // lost its tabs, so the parser skips it and the model has no Doubled to reach Base through.
    const withBase = (doubled: string) => [
      {
        path: "definition/tables/Sales.tmdl",
        text: `table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tmeasure Base = SUM('Sales'[Amount])\n${doubled}`,
      },
      ...reportFiles,
    ];
    const skipped = { id: "NOT_REACHED_FROM_REPORT", reason: "modelFileUnread" };
    const modelFact = (r: ReturnType<typeof lint>) => r.facts.find((f) => f.label === "Model");
    it("reports what is not reached while every model file was read", () => {
      const r = lint(withBase("\tmeasure Doubled = [Base] * 2\n"));
      expect(
        r.findings.filter((f) => f.ruleId === "NOT_REACHED_FROM_REPORT").map((f) => f.objectName),
      ).toEqual(["[Base]", "[Doubled]", "'Sales'[Amount]"]);
      expect(r.summary.rulesSkipped).not.toContainEqual(skipped);
    });
    it("is skipped with the reason while a parse issue can have dropped a model object", () => {
      const r = lint(withBase("    measure Doubled = [Base] * 2\n"));
      expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => f.objectName)).toEqual(
        ["definition/tables/Sales.tmdl"],
      );
      // Without the skip, Base would read as reached by nothing, which is false.
      expect(r.findings.filter((f) => f.ruleId === "NOT_REACHED_FROM_REPORT")).toEqual([]);
      expect(r.summary.rulesSkipped).toContainEqual(skipped);
      expect(skippedLine(r)).toContain("1 rule skipped (a model file could not be fully read)");
      expect(modelFact(r)).toEqual({
        layer: "model",
        label: "Model",
        value: "1 table, 1 column, 1 measure",
        detail: "not reached from this report: unknown, a model file could not be fully read",
      });
    });
    it("runs while the only parse issue is an orphaned description, which drops no declaration", () => {
      const r = lint(withBase("\t/// Twice the base\n\n\tmeasure Doubled = [Base] * 2\n"));
      expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toHaveLength(1);
      expect(r.summary.rulesSkipped).not.toContainEqual(skipped);
      expect(modelFact(r)?.ruleId).toBe("NOT_REACHED_FROM_REPORT");
    });
    it("gives the report file's reason when a report file could not be read as well", () => {
      const r = lint([
        ...withBase("    measure Doubled = [Base] * 2\n"),
        { path: "definition/pages/p/visuals/v/visual.json", text: "[]" },
      ]);
      expect(r.summary.rulesSkipped).toContainEqual({
        id: "NOT_REACHED_FROM_REPORT",
        reason: "reportFileUnread",
      });
      expect(r.summary.rulesSkipped).not.toContainEqual(skipped);
      expect(skippedLine(r)).not.toContain("a model file could not be fully read");
      expect(modelFact(r)?.detail).toBe(
        "not reached from this report: unknown, a report file could not be read",
      );
    });
    it("is the only rule a partly read model stops", () => {
      expect(
        defaultRules.filter((r) => r.skipWhenModelUnread).map((r) => [r.id, r.skipWhenModelUnread]),
      ).toEqual([["NOT_REACHED_FROM_REPORT", modelPartlyRead]]);
    });
  });
  describe("what the input reader could not read (the unreadPaths option)", () => {
    const card = (name: string, fields: unknown[]) => ({
      path: `definition/pages/p/visuals/${name}/visual.json`,
      text: j({
        name,
        position: {},
        visual: {
          visualType: "card",
          query: {
            queryState: { Values: { projections: fields.map((field) => ({ field })) } },
          },
        },
      }),
    });
    const ref = (kind: "Column" | "Measure", entity: string, property: string) => ({
      [kind]: { Expression: { SourceRef: { Entity: entity } }, Property: property },
    });
    const productFile = {
      path: "definition/tables/Product.tmdl",
      text: "table Product\n\tcolumn Category\n\t\tdataType: string\n",
    };
    const salesFile = {
      path: "definition/tables/Sales.tmdl",
      text: "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tmeasure Total = SUM('Sales'[Amount])\n",
    };
    // A table the model lacks, a column missing from a table, and a measure on another table.
    const broken = card("c", [
      ref("Column", "Store", "City"),
      ref("Column", "Sales", "Nope"),
      ref("Measure", "Product", "Total"),
    ]);
    const files = [salesFile, productFile, ...reportFiles, broken];
    const details = (r: ReturnType<typeof lint>, id: string) =>
      r.findings.filter((f) => f.ruleId === id).map((f) => f.detail);
    const fact = (r: ReturnType<typeof lint>, label: string) =>
      r.facts.find((f) => f.label === label);
    const modelRules = new Set(defaultRules.filter((r) => r.layer === "model").map((r) => r.id));
    const modelRuleFindings = (r: ReturnType<typeof lint>) =>
      r.findings.filter((f) => modelRules.has(f.ruleId));

    it("reads a model file it could not read as one it could not fully read, with no PARSE_ISSUE", () => {
      expect(details(lint(files), "BROKEN_FIELD_REFERENCE")).toEqual([
        `'Store'[City]: no table named "Store"`,
        `'Sales'[Nope]: no column named "Nope" on "Sales"`,
        `[Total]: [Total] is on "Sales", not "Product"`,
      ]);
      for (const path of ["definition/tables/Store.tmdl", "definition/tables/"]) {
        const r = lint(files, { unreadPaths: { model: [path] } });
        expect(r.project.model?.unreadPaths, path).toEqual([path]);
        // The Store.tmdl the model lacks could declare Store, and could declare Sales again with
        // Nope under it; a measure's name is unique in the model, so Total is still on Sales.
        expect(details(r, "BROKEN_FIELD_REFERENCE"), path).toEqual([
          `[Total]: [Total] is on "Sales", not "Product"`,
        ]);
        expect(details(r, "PARSE_ISSUE"), path).toEqual([]);
        // The input reader's own notice names the path; lint adds none.
        expect(r.diagnostics, path).toEqual([]);
        expect(r.summary.rulesSkipped, path).toContainEqual({
          id: "NOT_REACHED_FROM_REPORT",
          reason: "modelFileUnread",
        });
        expect(fact(r, "Model")?.detail, path).toBe(
          "not reached from this report: unknown, a model file could not be fully read",
        );
        // The model rules read the model as they would with a parse issue in it: as it was read.
        expect(modelRuleFindings(r), path).toEqual(modelRuleFindings(lint(files)));
        expect(modelRuleFindings(r).length, path).toBeGreaterThan(0);
      }
      // A model path that could hold no declaration, such as the model's .platform, changes nothing.
      const platform = lint(files, { unreadPaths: { model: [".platform"] } });
      expect(details(platform, "BROKEN_FIELD_REFERENCE")).toHaveLength(3);
      expect(platform.summary.rulesSkipped.map((s) => s.reason)).not.toContain("modelFileUnread");
    });

    it("reads a report file it could not read as one that failed to parse, with no PARSE_ISSUE", () => {
      const v = "definition/pages/p/visuals/v/visual.json";
      const unread = lint(files, { unreadPaths: { report: [v] } });
      const parsed = lint([...files, { path: v, text: '{ "name": "v", ' }]);
      expect(details(parsed, "PARSE_ISSUE")).toHaveLength(1);
      expect(details(unread, "PARSE_ISSUE")).toEqual([]);
      const rest = (r: ReturnType<typeof lint>) => ({
        findings: r.findings.filter((f) => f.ruleId !== "PARSE_ISSUE"),
        facts: r.facts,
        skipped: r.summary.rulesSkipped,
      });
      expect(rest(unread)).toEqual(rest(parsed));
      expect(unread.summary.rulesSkipped).toContainEqual({
        id: "NOT_REACHED_FROM_REPORT",
        reason: "reportFileUnread",
      });
      expect(skippedLine(unread)).toContain("1 rule skipped (a report file could not be read)");
      // The unread visual is known by its folder, on the page whose folder holds it.
      expect(unread.project.report?.unreadDefinitionFiles).toEqual([v]);
      expect(unread.project.report?.pages.map((p) => [p.id, p.unreadVisuals])).toEqual([
        ["p", ["v"]],
      ]);
      expect(fact(unread, "Slicers")).toEqual({
        layer: "report",
        label: "Slicers",
        value: "unknown",
        detail: "saved selections: unknown, a visual.json could not be read",
      });
      // A broken reference in a file that was read is broken whatever the unread file says.
      expect(details(unread, "BROKEN_FIELD_REFERENCE")).toHaveLength(3);
      // An unread definition.pbir, .platform, or .pbip names no field, and changes nothing.
      const outside = lint(files, {
        unreadPaths: { report: ["definition.pbir", ".platform", "../Demo.pbip"] },
      });
      expect(rest(outside)).toEqual(rest(lint(files)));
    });

    it("reads an unread report folder as every file it could hold, and the page or visual it names", () => {
      const bookmark = (name: string, sections: Record<string, unknown>) => ({
        path: `definition/bookmarks/${name}.bookmark.json`,
        text: j({ name, explorationState: { activeSection: "p", sections } }),
      });
      const button = {
        path: "definition/pages/p/visuals/go/visual.json",
        text: j({
          name: "go",
          position: {},
          visual: {
            visualType: "actionButton",
            visualContainerObjects: {
              visualLink: [
                {
                  properties: {
                    type: { expr: { Literal: { Value: "'Bookmark'" } } },
                    bookmark: { expr: { Literal: { Value: "'b9'" } } },
                  },
                },
              ],
            },
          },
        }),
      };
      const withBookmarks = [
        ...files,
        button,
        // Captures a visual on p that was not read and a page q that was not.
        bookmark("b1", { p: { visualContainers: { x: {} } }, q: {} }),
      ];
      const reported = (unreadPaths: string[], id: string) =>
        details(lint(withBookmarks, { unreadPaths: { report: unreadPaths } }), id);
      expect(reported([], "BROKEN_BOOKMARK_REFERENCE")).toEqual([
        'captured page "q" does not exist',
        'captured visual "x" is not on page "P"',
      ]);
      expect(reported([], "BROKEN_ACTION_TARGET")).toEqual([
        'Bookmark action points at bookmark "b9", which does not exist',
      ]);
      // A page's folder names the page; a page's visuals folder holds any visual on it.
      expect(
        reported(
          ["definition/pages/q/", "definition/pages/p/visuals/x/"],
          "BROKEN_BOOKMARK_REFERENCE",
        ),
      ).toEqual([]);
      expect(reported(["definition/pages/q/"], "BROKEN_BOOKMARK_REFERENCE")).toEqual([
        'captured visual "x" is not on page "P"',
      ]);
      // The visuals folder could not be listed, so the button and the card were not read either.
      const noVisuals = withBookmarks.filter(
        (f) => !f.path.startsWith("definition/pages/p/visuals/"),
      );
      expect(
        details(
          lint(noVisuals, { unreadPaths: { report: ["definition/pages/p/visuals/"] } }),
          "BROKEN_BOOKMARK_REFERENCE",
        ),
      ).toEqual(['captured page "q" does not exist']);
      // The pages folder could hold a page of any name.
      const noPages = withBookmarks.filter((f) => !f.path.startsWith("definition/pages/"));
      expect(
        details(
          lint(noPages, { unreadPaths: { report: ["definition/pages/"] } }),
          "BROKEN_BOOKMARK_REFERENCE",
        ),
      ).toEqual([]);
      expect(details(lint(noPages), "BROKEN_BOOKMARK_REFERENCE")).toEqual([
        'active page "p" does not exist',
        'captured page "q" does not exist',
      ]);
      // The bookmarks folder could hold a bookmark of any name.
      const noBookmarks = withBookmarks.filter((f) => !f.path.startsWith("definition/bookmarks/"));
      const r = lint(noBookmarks, { unreadPaths: { report: ["definition/bookmarks/"] } });
      expect(details(r, "BROKEN_ACTION_TARGET")).toEqual([]);
      // Bookmark files name fields, so what the report reaches is not known.
      expect(r.summary.rulesSkipped).toContainEqual({
        id: "NOT_REACHED_FROM_REPORT",
        reason: "reportFileUnread",
      });
      expect(details(r, "PARSE_ISSUE")).toEqual([]);
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
