import { describe, expect, it } from "vitest";
import { resolveConfig, type PbiplintConfig } from "../src/engine/config.js";
import { lint, type LintFile, type LintResult } from "../src/engine/lint.js";
import { showOnly } from "../src/engine/show-only.js";
import { eachQuery } from "../src/rules/m-helpers.js";
import { RULE_COULD_NOT_FINISH } from "../src/rules/rule-could-not-finish.js";
import type { Rule } from "../src/rules/types.js";
import { page } from "./report-helpers.js";

const tableFile = (name: string, annotation = ""): LintFile => ({
  path: `definition/tables/${name}.tmdl`,
  text: `table ${name}\n\tpartition ${name} = m\n\t\tmode: import\n\t\tsource = 1\n${annotation}`,
});
const modelFiles = (modelAnnotation = "", salesAnnotation = ""): LintFile[] => [
  { path: "definition/model.tmdl", text: `model Model\n\tculture: en-US\n${modelAnnotation}` },
  tableFile("Sales", salesAnnotation),
  tableFile("Stock"),
];

const base = {
  name: "Test rule",
  category: "Maintenance" as const,
  severity: 2 as const,
  scope: [],
  description: "",
  references: [],
  status: "ported" as const,
};
const PER_QUERY: Rule = {
  ...base,
  id: "PER_QUERY",
  layer: "powerquery",
  needs: ["model"],
  check: (_project, ctx) =>
    eachQuery(ctx, ctx.indexes.m.queries, (q) => {
      if (q.name === "Sales") throw new TypeError("a message");
      return [];
    }),
};
const WHOLE: Rule = {
  ...base,
  id: "WHOLE",
  layer: "model",
  needs: ["model"],
  check: () => {
    throw new Error("a message");
  },
};
const WHOLE_REPORT: Rule = {
  ...base,
  id: "WHOLE_REPORT",
  layer: "report",
  needs: ["report"],
  check: () => {
    throw new Error("a message");
  },
};
const TWICE: Rule = {
  ...base,
  id: "TWICE",
  layer: "powerquery",
  needs: ["model"],
  check: (_project, ctx) => {
    const q = ctx.indexes.m.queries.find((x) => x.name === "Sales")!;
    for (let i = 0; i < 2; i++)
      eachQuery(ctx, [q], () => {
        throw new Error("a message");
      });
    return [];
  },
};

const lintWith = (
  rules: Rule[],
  config?: PbiplintConfig,
  files: LintFile[] = modelFiles(),
): Promise<LintResult> =>
  lint(files, { rules, ...(config ? { config: resolveConfig(config) } : {}) });
const own = (r: LintResult) => r.findings.filter((f) => f.ruleId === "RULE_COULD_NOT_FINISH");

describe("RULE_COULD_NOT_FINISH", () => {
  it("gives one error finding on the query's partition, and fails the run", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, PER_QUERY]);
    expect(own(r)).toEqual([
      {
        ruleId: "RULE_COULD_NOT_FINISH",
        layer: "model",
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "definition/tables/Sales.tmdl", line: 2 },
        detail: "PER_QUERY could not finish on query 'Sales': TypeError",
        messageId: "RULE_COULD_NOT_FINISH",
        params: {
          rule: "PER_QUERY",
          where: { id: "query.name", params: { query: "'Sales'" } },
          kind: { id: "ruleError.errorClass", params: { class: "TypeError" } },
        },
      },
    ]);
    expect(r.groups.find((g) => g.rule.id === "RULE_COULD_NOT_FINISH")!.rule.severity).toBe(3);
    expect(r.failed).toBe(true);
  });

  it("names the model for a rule that throws out of its check", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, WHOLE]);
    expect(own(r)).toEqual([
      {
        ruleId: "RULE_COULD_NOT_FINISH",
        layer: "model",
        objectType: "Model",
        objectName: "Model",
        location: { file: "definition/model.tmdl", line: 1 },
        detail: "WHOLE could not finish on the model: Error",
        messageId: "RULE_COULD_NOT_FINISH",
        params: {
          rule: "WHOLE",
          where: { id: "ruleError.theModel", params: {} },
          kind: { id: "ruleError.errorClass", params: { class: "Error" } },
        },
      },
    ]);
  });

  it("names the report for a report rule that throws, on a report-only project", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, WHOLE_REPORT], undefined, [page("p")]);
    expect(own(r)).toHaveLength(1);
    expect(own(r)[0]).toMatchObject({
      layer: "report",
      objectType: "Report",
      objectId: "report",
      detail: "WHOLE_REPORT could not finish on the report: Error",
    });
  });

  it("names the model, without a location, for a rule that throws on empty input", async () => {
    const EMPTY: Rule = { ...WHOLE, id: "EMPTY", needs: [] };
    const r = await lintWith([RULE_COULD_NOT_FINISH, EMPTY], undefined, []);
    expect(own(r)).toEqual([
      {
        ruleId: "RULE_COULD_NOT_FINISH",
        layer: "model",
        objectType: "Model",
        objectName: "Model",
        detail: "EMPTY could not finish on the model: Error",
        messageId: "RULE_COULD_NOT_FINISH",
        params: {
          rule: "EMPTY",
          where: { id: "ruleError.theModel", params: {} },
          kind: { id: "ruleError.errorClass", params: { class: "Error" } },
        },
      },
    ]);
  });

  it("gives one finding per rule and object, and keeps every error", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, TWICE]);
    expect(own(r)).toHaveLength(1);
    expect(r.summary.ruleErrors).toHaveLength(2);
  });

  it("gives a finding for each query a rule fails on and for the model it then throws out of", async () => {
    const BOTH_THEN_THROWS: Rule = {
      ...base,
      id: "BOTH_THEN_THROWS",
      layer: "powerquery",
      needs: ["model"],
      check: (_project, ctx) => {
        eachQuery(ctx, ctx.indexes.m.queries, () => {
          throw new TypeError("a message");
        });
        throw new RangeError("a message");
      },
    };
    const r = await lintWith([RULE_COULD_NOT_FINISH, BOTH_THEN_THROWS]);
    expect(own(r).map((f) => [f.objectType, f.objectName, f.detail])).toEqual([
      ["Partition", "Sales", "BOTH_THEN_THROWS could not finish on query 'Sales': TypeError"],
      ["Partition", "Stock", "BOTH_THEN_THROWS could not finish on query 'Stock': TypeError"],
      ["Model", "Model", "BOTH_THEN_THROWS could not finish on the model: RangeError"],
    ]);
    expect(r.summary.ruleErrors).toEqual([
      { id: "BOTH_THEN_THROWS", message: "query 'Sales': TypeError" },
      { id: "BOTH_THEN_THROWS", message: "query 'Stock': TypeError" },
      { id: "BOTH_THEN_THROWS", message: "RangeError" },
    ]);
  });

  it("writes the findings in the order the errors happened", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, WHOLE, PER_QUERY]);
    expect(own(r).map((f) => f.detail)).toEqual([
      "WHOLE could not finish on the model: Error",
      "PER_QUERY could not finish on query 'Sales': TypeError",
    ]);
  });

  it("is a warning when the config lowers it, and the run passes", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, PER_QUERY], {
      rules: { RULE_COULD_NOT_FINISH: "warning" },
    });
    expect(r.groups.find((g) => g.rule.id === "RULE_COULD_NOT_FINISH")!.rule.severity).toBe(2);
    expect(r.failed).toBe(false);
  });

  it("writes nothing when it is turned off, and still lists the error", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, PER_QUERY], {
      rules: { RULE_COULD_NOT_FINISH: "off" },
    });
    expect(own(r)).toEqual([]);
    expect(r.summary.ruleErrors).toHaveLength(1);
    expect(r.failed).toBe(false);
    expect(r.summary.rulesSkipped).toContainEqual({
      id: "RULE_COULD_NOT_FINISH",
      reason: "disabled",
    });
  });

  it("has nothing to report when the failing rule is turned off, since that rule never runs", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, PER_QUERY], { rules: { PER_QUERY: "off" } });
    expect(own(r)).toEqual([]);
    expect(r.summary.ruleErrors).toEqual([]);
    expect(r.failed).toBe(false);
  });

  it.each(["RULE_COULD_NOT_FINISH", "PER_QUERY", "*"])(
    "drops the finding when the partition's pbiplint.ignore names %s",
    async (id) => {
      const r = await lintWith(
        [RULE_COULD_NOT_FINISH, PER_QUERY],
        undefined,
        modelFiles("", `\n\t\tannotation pbiplint.ignore = ${id}\n`),
      );
      expect(own(r)).toEqual([]);
      expect(r.summary.ignored).toBe(1);
      expect(r.summary.ruleErrors).toHaveLength(1);
    },
  );

  it("drops a whole-model finding when the model's annotation names it", async () => {
    const r = await lintWith(
      [RULE_COULD_NOT_FINISH, WHOLE],
      undefined,
      modelFiles("\nannotation pbiplint.ignore = RULE_COULD_NOT_FINISH\n"),
    );
    expect(own(r)).toEqual([]);
    expect(r.summary.ignored).toBe(1);
    expect(r.summary.ruleErrors).toHaveLength(1);
  });

  it("writes no finding when the caller's rules leave it out", async () => {
    const r = await lintWith([PER_QUERY]);
    expect(own(r)).toEqual([]);
    expect(r.summary.ruleErrors).toHaveLength(1);
  });

  it("returns no finding of its own from its check", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH]);
    expect(r.findings).toEqual([]);
    expect(r.summary.rulesRun).toBe(1);
  });
});

// pb-coord, October 28, 2026: a RULE_COULD_NOT_FINISH finding about rule X is one of X's own
// outcomes, so showing only X shows and gates it; one about another rule stays out.
describe("showOnly, with a rule that could not finish", () => {
  const config = resolveConfig({ failOn: "error" });
  it("keeps the finding about the rule it shows, and gates on it", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, WHOLE, PER_QUERY]);
    const kept = showOnly(r, ["PER_QUERY"], config);
    expect(kept.findings.map((f) => f.detail)).toEqual([
      "PER_QUERY could not finish on query 'Sales': TypeError",
    ]);
    expect(kept.groups.map((g) => [g.rule.id, g.findings.length])).toEqual([
      ["RULE_COULD_NOT_FINISH", 1],
    ]);
    expect(kept.summary.shown).toEqual({
      rules: ["PER_QUERY", "RULE_COULD_NOT_FINISH"],
      findings: 1,
      errors: 1,
      warnings: 0,
      infos: 0,
    });
    expect(kept.failed).toBe(true);
  });

  it("leaves out a finding about another rule, and passes", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, PER_QUERY]);
    const kept = showOnly(r, ["WHOLE"], config);
    expect(kept.findings).toEqual([]);
    expect(kept.groups).toEqual([]);
    expect(kept.failed).toBe(false);
  });

  it("tells a rule apart from one whose id it begins", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, PER_QUERY]);
    expect(showOnly(r, ["PER"], config).findings).toEqual([]);
  });

  it("keeps every such finding when it shows RULE_COULD_NOT_FINISH itself", async () => {
    const r = await lintWith([RULE_COULD_NOT_FINISH, WHOLE, PER_QUERY]);
    expect(showOnly(r, ["RULE_COULD_NOT_FINISH"], config).findings).toHaveLength(2);
  });
});
