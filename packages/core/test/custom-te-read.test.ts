import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/custom-rules/limits.js";
import { readTeRuleFile, type TeRule, type TeRuleFile } from "../src/custom-rules/te/read.js";

const repo = new URL("../../../", import.meta.url).pathname;
const probesDir = `${repo}tests/rules/te-probes/`;
const capture = JSON.parse(
  readFileSync(`${repo}tests/expectations/custom-rules/probes/custom-rules.json`, "utf8"),
) as {
  results: Record<
    string,
    | { error: string; sha256?: string }
    | {
        sha256: string;
        findings: Record<string, string[]>;
        ruleErrors: Record<string, string>;
        quiet: string[];
      }
  >;
};

/** A rule written for these tests, with every key Tabular Editor's shape uses. */
const rule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ID: "SALES_MEASURE_FOLDER",
  Name: "Sales measures sit in a display folder",
  Category: "Maintenance",
  Description: "Every measure on the Sales table belongs in a display folder.",
  Severity: 2,
  Scope: "Measure",
  Expression: 'Table.Name == "Sales" and string.IsNullOrEmpty(DisplayFolder)',
  ...over,
});

const read = (value: unknown): TeRuleFile => readTeRuleFile(JSON.stringify(value));

function ok(file: TeRuleFile): Extract<TeRuleFile, { rules: TeRule[] }> {
  if ("error" in file) throw new Error(`expected rules, got the error: ${file.error}`);
  return file;
}

function refused(file: TeRuleFile): string {
  if (!("error" in file)) throw new Error("expected the file to be refused");
  return file.error;
}

describe("readTeRuleFile: layout", () => {
  it("reads an array of rules with every field", () => {
    const file = ok(read([rule()]));
    expect(file.problems).toEqual([]);
    expect(file.rules).toEqual([
      {
        id: "SALES_MEASURE_FOLDER",
        name: "Sales measures sit in a display folder",
        category: "Maintenance",
        description: "Every measure on the Sales table belongs in a display folder.",
        severity: 2,
        scopes: ["Measure"],
        expression: 'Table.Name == "Sales" and string.IsNullOrEmpty(DisplayFolder)',
        disabled: false,
      },
    ]);
  });

  it("reads an object with a rules array, the key in any case", () => {
    expect(ok(read({ rules: [rule()] })).rules).toHaveLength(1);
    expect(ok(read({ Rules: [rule()] })).rules).toHaveLength(1);
    expect(ok(read({ RULES: [rule()] })).rules).toHaveLength(1);
  });

  it("matches keys in any case", () => {
    const file = ok(
      read([
        {
          id: "lower_keys",
          name: "Lowercase keys",
          scope: "Table",
          expression: "IsHidden",
          severity: 3,
          isdisabled: true,
        },
        { iD: "mixed_keys", nAmE: "Mixed keys", sCoPe: "Column", ExPrEsSiOn: "IsHidden" },
      ]),
    );
    expect(file.problems).toEqual([]);
    expect(file.rules.map((r) => [r.id, r.name, r.scopes, r.severity, r.disabled])).toEqual([
      ["lower_keys", "Lowercase keys", ["Table"], 3, true],
      ["mixed_keys", "Mixed keys", ["Column"], undefined, false],
    ]);
  });

  it("reads a numeric ID as its decimal string", () => {
    expect(ok(read([rule({ ID: 7001 })])).rules[0]!.id).toBe("7001");
  });

  it("reads a byte order mark and comments", () => {
    const text = `\uFEFF// team rules\n[\n  /* one */ ${JSON.stringify(rule())} // done\n]`;
    expect(ok(readTeRuleFile(text)).rules).toHaveLength(1);
  });

  it("refuses text that is not JSON", () => {
    expect(refused(readTeRuleFile("[{"))).toMatch(/not valid JSON/);
  });

  it("refuses a file that is neither an array nor an object with a rules array", () => {
    for (const value of [{ checks: [rule()] }, { rules: rule() }, "rules", 42, null]) {
      expect(refused(read(value))).toMatch(/array of rules/);
    }
  });

  it("reads an empty array as no rules", () => {
    expect(ok(read([]))).toEqual({ rules: [], problems: [] });
  });
});

describe("readTeRuleFile: scopes", () => {
  it("splits a comma-separated list with spaces", () => {
    const file = ok(read([rule({ Scope: "Table, CalculatedTable,Measure ,  Column" })]));
    expect(file.rules[0]!.scopes).toEqual(["Table", "CalculatedTable", "Measure", "Column"]);
  });

  it("accepts every scope Tabular Editor accepts", () => {
    const all = [
      "Model",
      "Table",
      "CalculatedTable",
      "Column",
      "DataColumn",
      "CalculatedColumn",
      "CalculatedTableColumn",
      "Measure",
      "Hierarchy",
      "Level",
      "Partition",
      "Relationship",
      "Perspective",
      "Culture",
      "ModelRole",
      "ModelRoleMember",
      "TablePermission",
      "CalculationGroup",
      "CalculationItem",
      "KPI",
      "NamedExpression",
      "ProviderDataSource",
      "StructuredDataSource",
      "Variation",
      "Calendar",
      "UserDefinedFunction",
    ];
    const file = ok(read([rule({ Scope: all.join(", ") })]));
    expect(file.problems).toEqual([]);
    expect(file.rules[0]!.scopes).toEqual(all);
  });

  it("reports a rule with no scope and keeps the file's other rules", () => {
    const noScope = rule({ ID: "NO_SCOPE", Name: "No scope" });
    delete noScope.Scope;
    const file = ok(read([noScope, rule({ ID: "BLANK_SCOPE", Scope: "  " }), rule()]));
    expect(file.rules.map((r) => r.id)).toEqual(["SALES_MEASURE_FOLDER"]);
    expect(file.problems.map((p) => p.id)).toEqual(["NO_SCOPE", "BLANK_SCOPE"]);
    expect(file.problems[0]!.name).toBe("No scope");
    expect(file.problems[0]!.reason).toMatch(/no Scope/);
  });

  it("reports an unknown scope by name and keeps the file's other rules", () => {
    const file = ok(read([rule({ ID: "ODD_SCOPE", Scope: "Measure, Dashboard" }), rule()]));
    expect(file.rules.map((r) => r.id)).toEqual(["SALES_MEASURE_FOLDER"]);
    expect(file.problems).toHaveLength(1);
    expect(file.problems[0]!.id).toBe("ODD_SCOPE");
    expect(file.problems[0]!.reason).toContain("Dashboard");
  });

  it("names the scope to use for a name Tabular Editor refuses but has a near match", () => {
    const file = ok(read([rule({ Scope: "CalculationGroupTable" })]));
    expect(file.problems[0]!.reason).toContain("use CalculationGroup.");
  });

  it("reports a report scope, saying report rules use fab-inspector's format", () => {
    for (const scope of ["Page", "Visual", "CustomVisual", "Filter", "Report"]) {
      const file = ok(read([rule({ ID: "REPORT_SCOPE", Scope: scope }), rule()]));
      expect(file.rules.map((r) => r.id)).toEqual(["SALES_MEASURE_FOLDER"]);
      expect(file.problems[0]!.reason).toMatch(/fab-inspector's format/);
    }
  });

  it("reads scope names in any case as Tabular Editor's names", () => {
    expect(ok(read([rule({ Scope: "measure, DATACOLUMN" })])).rules[0]!.scopes).toEqual([
      "Measure",
      "DataColumn",
    ]);
  });

  it("lists a repeated scope once", () => {
    expect(ok(read([rule({ Scope: "Measure, Measure" })])).rules[0]!.scopes).toEqual(["Measure"]);
  });
});

describe("readTeRuleFile: fab-inspector's shape", () => {
  const fabRule = {
    id: "PAGE_TITLE",
    name: "Every page has a title",
    part: "Pages",
    test: [{ "!!": [{ var: "displayName" }] }, true],
  };

  it("refuses a file of fab-inspector rules, saying they come in a later release", () => {
    expect(refused(read([fabRule]))).toMatch(
      /report rules in fab-inspector's format come in a later release/,
    );
    expect(refused(read({ rules: [fabRule] }))).toMatch(/later release/);
  });

  it("refuses a file that mixes the two shapes, saying so", () => {
    expect(refused(read([rule(), fabRule]))).toMatch(/mixes/);
  });
});

describe("readTeRuleFile: each rule", () => {
  it("ignores IsDisabled for running, recording it as read", () => {
    const file = ok(read([rule({ IsDisabled: true })]));
    expect(file.rules).toHaveLength(1);
    expect(file.rules[0]!.disabled).toBe(true);
  });

  it("reports a rule with no expression or one that is not text", () => {
    const missing = rule({ ID: "NO_EXPRESSION" });
    delete missing.Expression;
    const file = ok(
      read([
        missing,
        rule({ ID: "EMPTY_EXPRESSION", Expression: "   " }),
        rule({ ID: "NUMBER_EXPRESSION", Expression: 1 }),
      ]),
    );
    expect(file.rules).toEqual([]);
    expect(file.problems.map((p) => p.id)).toEqual([
      "NO_EXPRESSION",
      "EMPTY_EXPRESSION",
      "NUMBER_EXPRESSION",
    ]);
    expect(file.problems[0]!.reason).toMatch(/no Expression/);
    expect(file.problems[2]!.reason).toMatch(/text/);
  });

  it("reports an expression over the length limit, naming the limit without quoting it", () => {
    const long = `Name == "${"q".repeat(LIMITS.expressionChars)}"`;
    const file = ok(read([rule({ ID: "LONG", Expression: long }), rule()]));
    expect(file.rules.map((r) => r.id)).toEqual(["SALES_MEASURE_FOLDER"]);
    expect(file.problems[0]!.reason).toContain("20,000");
    expect(file.problems[0]!.reason).not.toContain("qqq");
  });

  it("reports rules past the per-file limit, naming the limit", () => {
    const rules = Array.from({ length: LIMITS.rulesPerFile + 2 }, (_, i) =>
      rule({ ID: `R${i}`, Expression: "true" }),
    );
    const file = ok(read(rules));
    expect(file.rules).toHaveLength(LIMITS.rulesPerFile);
    expect(file.problems.map((p) => p.id)).toEqual([
      `R${LIMITS.rulesPerFile}`,
      `R${LIMITS.rulesPerFile + 1}`,
    ]);
    expect(file.problems[0]!.reason).toContain("2,000");
  });

  it("reports a rule with no ID, or an entry that is not a rule, by its place in the file", () => {
    const noId = rule({ Name: "Nameless id" });
    delete noId.ID;
    const file = ok(read([rule(), noId, "not a rule"]));
    expect(file.rules).toHaveLength(1);
    expect(file.problems.map((p) => [p.id, p.name])).toEqual([
      ["(rule 2)", "Nameless id"],
      ["(rule 3)", undefined],
    ]);
    expect(file.problems[0]!.reason).toMatch(/no ID/);
  });

  it("names a rule with no Name by its ID", () => {
    const unnamed = rule();
    delete unnamed.Name;
    expect(ok(read([unnamed])).rules[0]!.name).toBe("SALES_MEASURE_FOLDER");
  });

  it("leaves out a description, category or severity that is missing", () => {
    const bare = ok(read([{ ID: "BARE", Scope: "Model", Expression: "true" }])).rules[0]!;
    expect(bare).toEqual({
      id: "BARE",
      name: "BARE",
      scopes: ["Model"],
      expression: "true",
      disabled: false,
    });
  });

  it("never quotes an expression in a reason", () => {
    const secret = 'Name.Contains("Payroll Secret")';
    const file = ok(
      read([
        rule({ ID: "A", Scope: undefined, Expression: secret }),
        rule({ ID: "B", Scope: "Visual", Expression: secret }),
        rule({ ID: "C", Scope: "Gizmo", Expression: secret }),
        rule({ ID: "C", Scope: "Measure", Expression: secret }),
      ]),
    );
    expect(file.problems).toHaveLength(4);
    for (const p of file.problems) expect(p.reason).not.toContain("Payroll");
  });
});

describe("readTeRuleFile: duplicates", () => {
  it("keeps an identical rule once", () => {
    const file = ok(read([rule(), rule()]));
    expect(file.rules).toHaveLength(1);
    expect(file.problems).toEqual([]);
  });

  it("keeps the first of two different rules sharing an ID and reports the second", () => {
    const file = ok(read([rule(), rule({ Scope: "Table" }), rule({ ID: "OTHER" })]));
    expect(file.rules.map((r) => [r.id, r.scopes])).toEqual([
      ["SALES_MEASURE_FOLDER", ["Measure"]],
      ["OTHER", ["Measure"]],
    ]);
    expect(file.problems).toHaveLength(1);
    expect(file.problems[0]!.id).toBe("SALES_MEASURE_FOLDER");
    expect(file.problems[0]!.reason).toMatch(/first rule with this ID/);
  });

  it("counts a difference in any field, even the description", () => {
    const file = ok(read([rule(), rule({ Description: "Reworded." })]));
    expect(file.rules).toHaveLength(1);
    expect(file.problems).toHaveLength(1);
  });

  it("reports a later rule whose ID belongs to an earlier rule that could not be read", () => {
    const file = ok(read([rule({ Scope: "Visual" }), rule()]));
    expect(file.rules).toEqual([]);
    expect(file.problems).toHaveLength(2);
    expect(file.problems[1]!.reason).toMatch(/first rule with this ID/);
  });

  it("reports an identical rule that could not be read once", () => {
    const file = ok(read([rule({ Scope: "Visual" }), rule({ Scope: "Visual" })]));
    expect(file.problems).toHaveLength(1);
  });
});

describe("readTeRuleFile: the probe files Tabular Editor read", () => {
  const files = readdirSync(probesDir).filter((f) => f.endsWith(".json"));

  it("has a capture for every probe file", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(capture.results).toHaveProperty(f);
  });

  for (const f of files) {
    it(`agrees with the capture for ${f}`, () => {
      const bytes = readFileSync(`${probesDir}${f}`);
      const result = capture.results[f]!;
      if (result.sha256) {
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(result.sha256);
      }
      const file = ok(readTeRuleFile(bytes.toString("utf8")));
      const read = file.rules.map((r) => r.id);
      const problems = file.problems.map((p) => p.id);
      expect(new Set(read).size).toBe(read.length);

      if (f === "unknown-scope.json") {
        // Recorded difference: Tabular Editor refuses the whole file for one unknown scope.
        expect(result).toHaveProperty("error");
        expect(read).toEqual(["PROBE_SCOPE_UNKNOWN_SIBLING"]);
        expect(problems).toEqual(["PROBE_SCOPE_UNKNOWN"]);
        expect(file.problems[0]!.reason).toMatch(/fab-inspector's format/);
        return;
      }
      if ("error" in result) throw new Error(`${f}: Tabular Editor refused it`);
      const ran = [
        ...Object.keys(result.findings),
        ...Object.keys(result.ruleErrors),
        ...result.quiet,
      ];
      if (f === "no-scope.json") {
        // Recorded difference: Tabular Editor runs a rule with no scope on nothing, silently.
        expect(read).toEqual(["PROBE_NO_SCOPE_SIBLING"]);
        expect(problems).toEqual(["PROBE_NO_SCOPE"]);
        return;
      }
      expect([...read].sort()).toEqual([...new Set(ran)].sort());
      if (f === "duplicates.json") {
        // Tabular Editor ran each id once, the first with the id; pbiplint says so for the second.
        expect(read).toEqual(["PROBE_DUPLICATE_SAME", "PROBE_DUPLICATE_DIFFERENT"]);
        expect(file.rules[1]!.scopes).toEqual(["Model"]);
        expect(problems).toEqual(["PROBE_DUPLICATE_DIFFERENT"]);
        return;
      }
      expect(problems).toEqual([]);
      if (f === "layout.json") {
        expect(read).toEqual(["PROBE_LAYOUT_LOWERCASE", "4242"]);
      }
    });
  }
});
