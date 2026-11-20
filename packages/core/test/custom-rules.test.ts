import { beforeEach, describe, expect, it, vi } from "vitest";
import * as entry from "@pbiplint/core/custom-rules";
import { readCustomRules, teSeverity, tomFinding } from "../src/custom-rules/rules.js";
import { teRunner } from "../src/custom-rules/te/index.js";
import { buildTomView, TE_SCOPES, type TomObject } from "../src/custom-rules/te/view.js";
import { ConfigError } from "../src/engine/config.js";
import { isCustomRuleStop, type CustomRuleSet } from "../src/engine/custom.js";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { defaultRules } from "../src/rules/index.js";
import { finding, modelPartlyRead } from "../src/rules/helpers.js";
import {
  CATEGORY_ORDER,
  type Rule,
  type RuleContext,
  type RuleFinding,
} from "../src/rules/types.js";
import type { Diagnostic } from "../src/project/types.js";
import { fixturesDir, parseModelDir } from "./helpers.js";

// Count the model views built, to show a rule is evaluated only when its check runs and that one
// view serves every rule on a model.
vi.mock("../src/custom-rules/te/view.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/custom-rules/te/view.js")>();
  return { ...real, buildTomView: vi.fn(real.buildTomView) };
});
const viewsBuilt = () => vi.mocked(buildTomView).mock.calls.length;

const modelAt = (fixture: string): Model =>
  buildModel(parseModelDir(`${fixturesDir}${fixture}.SemanticModel`));

const rule = (fields: Record<string, unknown> = {}) => ({
  ID: "TEAM_MEASURE_FOLDER",
  Name: "Measures sit in a display folder",
  Category: "Team",
  Severity: 2,
  Scope: "Measure",
  Expression: 'DisplayFolder = ""',
  ...fields,
});
const file = (path: string, rules: unknown[]) => ({ path, text: JSON.stringify(rules) });

/** Runs a custom rule's check on a model, collecting its notices. */
function check(r: Rule, model: Model): { findings: RuleFinding[]; notices: Diagnostic[] } {
  const notices: Diagnostic[] = [];
  const ctx: RuleContext = {
    indexes: buildIndexes({ model }),
    options: {},
    notice: (d) => notices.push(d),
  };
  return { findings: r.check({ model }, ctx), notices };
}

/** What a check throws, or undefined when it returns. */
function thrown(r: Rule, model: Model): unknown {
  try {
    check(r, model);
  } catch (e) {
    return e;
  }
  return undefined;
}

const byId = (set: CustomRuleSet, id: string): Rule => {
  const found = set.rules.find((r) => r.id === id);
  if (!found) throw new Error(`no custom rule ${id}`);
  return found;
};

beforeEach(() => {
  vi.mocked(buildTomView).mockClear();
});

describe("teSeverity", () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [2.5, 2],
    [3, 3],
    [5, 3],
    [-1, 1],
    [undefined, 1],
  ] as const)("reads %s as %s", (given, expected) => {
    expect(teSeverity(given)).toBe(expected);
  });
});

describe("tomFinding", () => {
  // Each object a scope yields, from the fixtures that between them hold every scope.
  const fixtures = [
    "custom-rules",
    "te3-zoo",
    "kitchen-sink",
    "data-sources",
    "rule-zoo",
    "tvw-baseline",
  ];
  const objects: [string, TomObject][] = [];
  for (const fixture of fixtures) {
    const view = buildTomView(modelAt(fixture));
    for (const scope of TE_SCOPES) for (const o of view.objectsOf(scope)) objects.push([scope, o]);
  }
  const without = ({ message: _message, ...f }: RuleFinding): RuleFinding => f;
  /** What the built-in helpers give the object, without the context message a custom finding never carries. */
  function expected(o: TomObject): RuleFinding | undefined {
    const s = o.source as never;
    switch (o.type) {
      case "Model":
        return finding.model(s);
      case "Table":
      case "CalculatedTable":
      case "CalculationGroupTable":
        return finding.table(s);
      case "DataColumn":
      case "CalculatedColumn":
      case "CalculatedTableColumn":
        return finding.column(s);
      case "Measure":
        return finding.measure(s);
      case "Hierarchy":
        return without(finding.hierarchy(s));
      case "Level":
        return without(finding.level(s));
      case "Partition":
        return without(finding.partition(s));
      case "Relationship":
        return finding.relationship(s);
      case "Perspective":
        return finding.perspective(s);
      case "ModelRole":
        return finding.role(s);
      case "TablePermission":
        return without(finding.tablePermission(s));
      case "CalculationItem":
        return without(finding.calculationItem(s));
      case "NamedExpression":
        return finding.expression(s);
      case "ProviderDataSource":
      case "StructuredDataSource":
        return finding.dataSource(s);
      case "Function":
        return finding.function(s);
      default:
        return undefined;
    }
  }

  it("reaches every scope in the fixtures", () => {
    expect(new Set(objects.map(([scope]) => scope))).toEqual(new Set(TE_SCOPES));
  });

  it("gives an object the built-in helpers name what the helper gives, with no message", () => {
    for (const [scope, o] of objects) {
      const want = expected(o);
      if (want === undefined) continue;
      expect(tomFinding(o), `${scope} ${o.teName}`).toEqual(want);
    }
  });

  it("names the objects no built-in rule reports as Tabular Editor does, each with a location", () => {
    const types = { KPI: "KPI", Culture: "Culture", ModelRoleMember: "RoleMember" } as const;
    const seen = new Set<string>();
    for (const [, o] of objects) {
      if (expected(o) !== undefined) continue;
      const f = tomFinding(o);
      seen.add(f.objectType);
      expect(f.objectName).toBe(o.teName);
      expect(f.location?.file, `${o.type} ${o.teName}`).toBeTruthy();
      expect(f.message).toBeUndefined();
      expect(f.object).toBeDefined();
      if (o.type in types) expect(f.objectType).toBe(types[o.type as keyof typeof types]);
      else expect(f.objectType).toBe(o.type);
    }
    expect(seen).toEqual(new Set(["KPI", "Culture", "RoleMember", "Variation", "Calendar"]));
  });

  it("gives an object with no annotations of its own an empty one, so the model's still reaches it", () => {
    const kpi = objects.find(([, o]) => o.type === "KPI")![1];
    expect(tomFinding(kpi).object).toEqual({ annotations: {} });
  });
});

describe("readCustomRules", () => {
  it("is exported from the custom rules entry", () => {
    expect(entry.readCustomRules).toBe(readCustomRules);
    expect(entry.teSeverity).toBe(teSeverity);
  });

  it("makes each Tabular Editor rule a custom rule", () => {
    const set = readCustomRules([
      file("rules/team.json", [
        rule({ Description: "Every measure sits in a folder." }),
        rule({
          ID: "TEAM_COLUMNS",
          Name: undefined,
          Category: undefined,
          Severity: undefined,
          Scope:
            "DataColumn, CalculatedColumn, Column, ModelRole, ProviderDataSource, UserDefinedFunction, ModelRoleMember",
        }),
      ]),
    ]);
    expect(set.files).toEqual([
      { path: "rules/team.json", ids: ["TEAM_MEASURE_FOLDER", "TEAM_COLUMNS"] },
    ]);
    expect(set.notices).toEqual([]);
    const [measure, columns] = set.rules as [Rule, Rule];
    expect(measure).toMatchObject({
      id: "TEAM_MEASURE_FOLDER",
      name: "Measures sit in a display folder",
      description: "Every measure sits in a folder.",
      category: "Team",
      severity: 2,
      scope: ["Measure"],
      layer: "model",
      needs: ["model"],
      references: [],
      status: "custom",
      custom: {
        file: "rules/team.json",
        scopes: ["Measure"],
        expression: 'DisplayFolder = ""',
        teSeverity: 2,
      },
    });
    expect(measure.skipWhenModelUnread).toBe(modelPartlyRead);
    expect(columns).toMatchObject({
      name: "TEAM_COLUMNS",
      description: "TEAM_COLUMNS",
      category: "Custom",
      severity: 1,
      scope: [
        "Column",
        "CalculatedColumn",
        "CalculatedTableColumn",
        "Role",
        "DataSource",
        "Function",
        "RoleMember",
      ],
    });
    expect(columns.custom).not.toHaveProperty("teSeverity");
  });

  it("refuses a file it cannot read as rules with a ConfigError naming the file", () => {
    const run = () => readCustomRules([{ path: "rules/bad.json", text: "{ not json" }]);
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(/customRules: rules\/bad\.json: /);
    expect(() =>
      readCustomRules([file("rules/fab.json", [{ id: "X", part: "Visuals", test: [] }])]),
    ).toThrow(/rules\/fab\.json: .*fab-inspector/);
  });

  it("makes a rule the reader could not read a rule that stops with the reader's reason", () => {
    const model = modelAt("custom-rules");
    const set = readCustomRules([file("rules/team.json", [rule({ Scope: undefined })])]);
    const r = byId(set, "TEAM_MEASURE_FOLDER");
    expect(r.status).toBe("custom");
    expect(r.custom?.file).toBe("rules/team.json");
    const e = thrown(r, model);
    expect(isCustomRuleStop(e)).toBe(true);
    expect((e as { reason: string }).reason).toMatch(/has no Scope/);
  });

  it("gives rules with no ID ids of their own across files", () => {
    const set = readCustomRules([
      file("rules/a.json", [rule({ ID: undefined })]),
      file("rules/b.json", [rule({ ID: undefined })]),
    ]);
    const ids = set.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe("(rule 1)");
    expect(set.files.map((f) => f.ids)).toEqual([[ids[0]], [ids[1]]]);
    expect(set.notices).toEqual([]);
  });

  it("makes a second, different rule with one ID in a file a notice", () => {
    const set = readCustomRules([file("rules/team.json", [rule(), rule({ Scope: "Table" })])]);
    expect(set.rules.map((r) => r.id)).toEqual(["TEAM_MEASURE_FOLDER"]);
    expect(set.rules[0]!.scope).toEqual(["Measure"]);
    expect(set.files[0]!.ids).toEqual(["TEAM_MEASURE_FOLDER"]);
    expect(set.notices).toHaveLength(1);
    expect(set.notices[0]).toMatchObject({
      kind: "custom-rule-duplicate",
      path: "rules/team.json",
    });
    expect(set.notices[0]!.message).toContain("TEAM_MEASURE_FOLDER");
  });

  it("runs a rule two files hold alike once", () => {
    const set = readCustomRules([
      file("rules/team.json", [rule()]),
      file("rules/more.json", [rule({ ID: "team_measure_folder", Name: "Another name" })]),
    ]);
    expect(set.rules.map((r) => r.id)).toEqual(["TEAM_MEASURE_FOLDER"]);
    expect(set.rules[0]!.custom?.file).toBe("rules/team.json");
    expect(set.files.map((f) => f.ids)).toEqual([["TEAM_MEASURE_FOLDER"], ["team_measure_folder"]]);
    expect(set.notices).toEqual([]);
  });

  it("runs the first of two different rules with one ID and names the other file in a notice", () => {
    const set = readCustomRules([
      file("rules/team.json", [rule()]),
      file("rules/more.json", [rule({ Severity: 3 })]),
    ]);
    expect(set.rules).toHaveLength(1);
    expect(set.rules[0]!.severity).toBe(2);
    expect(set.notices).toHaveLength(1);
    expect(set.notices[0]).toMatchObject({
      kind: "custom-rule-duplicate",
      path: "rules/more.json",
    });
    expect(set.notices[0]!.message).toContain("rules/team.json");
    expect(set.notices[0]!.message).toContain("TEAM_MEASURE_FOLDER");
  });

  it.each(["PARSE_ISSUE", "rule_could_not_finish"])(
    "refuses %s as a custom id: the rule cannot run",
    (id) => {
      const set = readCustomRules([file("rules/team.json", [rule({ ID: id })])]);
      const e = thrown(byId(set, id), modelAt("custom-rules"));
      expect(isCustomRuleStop(e)).toBe(true);
      expect((e as { reason: string }).reason).toContain(id.toUpperCase());
    },
  );

  it("runs a custom id with a space in it", () => {
    const set = readCustomRules([file("rules/team.json", [rule({ ID: "TEAM MEASURES" })])]);
    expect(set.rules.map((r) => r.id)).toEqual(["TEAM MEASURES"]);
  });

  it("evaluates nothing until a check runs, and builds one view for every rule on a model", () => {
    const set = readCustomRules([
      file("rules/team.json", [
        rule(),
        rule({ ID: "TEAM_TABLES", Scope: "Table", Expression: "true" }),
      ]),
    ]);
    expect(viewsBuilt()).toBe(0);
    const model = modelAt("custom-rules");
    const measures = check(byId(set, "TEAM_MEASURE_FOLDER"), model).findings;
    const tables = check(byId(set, "TEAM_TABLES"), model).findings;
    expect(viewsBuilt()).toBe(1);
    expect(measures.length).toBeGreaterThan(0);
    expect(measures.every((f) => f.objectType === "Measure")).toBe(true);
    expect(tables.map((f) => f.objectName)).toContain("'Orders'");
    expect(teRunner(model)).toBe(teRunner(model));
  });

  it("stops a rule that cannot run with the evaluator's reason", () => {
    const set = readCustomRules([file("rules/team.json", [rule({ Expression: "Visible" })])]);
    const e = thrown(set.rules[0]!, modelAt("custom-rules"));
    expect(isCustomRuleStop(e)).toBe(true);
    expect((e as { reason: string }).reason).toMatch(/Visible/);
  });

  it("gives a notice when objects are left out for a value the files leave unset", () => {
    const set = readCustomRules([
      file("rules/team.json", [
        rule({
          ID: "TEAM_TEXT",
          Scope: "CalculatedColumn",
          Expression: "DataType = DataType.String",
        }),
      ]),
    ]);
    const { notices } = check(set.rules[0]!, modelAt("custom-rules"));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "custom-rule-left-out", path: "rules/team.json" });
    expect(notices[0]!.message).toContain("TEAM_TEXT");
    expect(notices[0]!.message).not.toContain("Amount Band");
  });
});

describe("categories", () => {
  it("keeps pbiplint's own rules to its eight categories", () => {
    for (const r of defaultRules) expect(CATEGORY_ORDER, r.id).toContain(r.category);
  });
});
