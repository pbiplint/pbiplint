import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import { finding, modelPartlyRead } from "../src/rules/helpers.js";
import {
  UDF_NOT_CALLED,
  UDF_USE_COMPOUND_NAMES,
  UDF_WITHOUT_DESCRIPTION,
} from "../src/rules/pbiplint/functions.js";
import type { Rule } from "../src/rules/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { fixturesDir, modelFrom, objectNames, parseModelDir } from "./helpers.js";

/** A model whose functions sit in definition/functions.tmdl, as Power BI Desktop saves them. */
const withFunctions = (tables: string, functions: string) =>
  buildModel([
    parseTmdl("definition/tables/Sales.tmdl", tables),
    parseTmdl("definition/functions.tmdl", functions),
  ]);
const findings = (rule: Rule, tables: string, functions: string) => {
  const model = withFunctions(tables, functions);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }), options: {} })
    .map((f) => ({ name: f.objectName, type: f.objectType, detail: f.detail, at: f.location }));
};
const sales = `table Sales
	column Amount
		dataType: decimal
	measure Total = SUM ( 'Sales'[Amount] )
`;
/** A DAX Lib package function, with the two annotations Desktop keeps when it installs one. */
const packaged = (name: string, body: string, pkg = "Contoso.Tax") =>
  `function '${name}' = ${body}\n\tlineageTag: ${name}\n\n\tannotation DAXLIB_PackageId = ${pkg}\n\n\tannotation DAXLIB_PackageVersion = 1.0.0\n\n`;

describe("finding.function", () => {
  it("names a function bare, as Tabular Editor does, at its function line", () => {
    const model = withFunctions(
      sales,
      "/// Adds tax.\nfunction 'Local.AddTax' = (x: NUMERIC) => x\n",
    );
    const f = model.functions[0]!;
    expect(finding.function(f)).toEqual({
      objectType: "Function",
      objectName: "Local.AddTax",
      location: { file: "definition/functions.tmdl", line: 2 },
      object: f,
    });
  });
});

describe("UDF_NOT_CALLED", () => {
  it("is pbiplint's own info rule on the model's functions, stopped by a partly read model", () => {
    expect(UDF_NOT_CALLED).toMatchObject({
      id: "UDF_NOT_CALLED",
      name: "User-defined function nothing calls",
      category: "Maintenance",
      severity: 1,
      scope: ["Function"],
      layer: "model",
      needs: ["model"],
      status: "builtin",
    });
    expect(UDF_NOT_CALLED.skipWhenModelUnread).toBe(modelPartlyRead);
  });

  it("reports a function nothing calls, at its function line, with no detail", () => {
    const functions = [
      "/// Used.",
      "function 'Local.Used' = (x: NUMERIC) => x",
      "",
      "/// Nothing calls it.",
      "function 'Local.Unused' = (x: NUMERIC) => x * 2",
      "",
    ].join("\n");
    const tables = `${sales}\tmeasure Taxed = Local.Used ( [Total] )\n`;
    expect(findings(UDF_NOT_CALLED, tables, functions)).toEqual([
      {
        name: "Local.Unused",
        type: "Function",
        detail: undefined,
        at: { file: "definition/functions.tmdl", line: 5 },
      },
    ]);
  });

  it("counts a call from any DAX the model holds, other functions included, in any letter case", () => {
    const names = ["Measure", "Column", "Table", "Item", "Role", "Format", "Kpi", "Inner", "Outer"];
    const functions = names.map((n) => `function 'Fn.${n}' = () => 1\n`).join("\n");
    const tables = `table Sales
	column Amount
		dataType: decimal
	column Doubled = FN.COLUMN () * 'Sales'[Amount]
		dataType: decimal
	measure Total = fn.measure ()
		formatStringDefinition = Fn.Format ()
		kpi
			targetExpression = Fn.Kpi ()
	measure Wrapped = Fn.Outer ()

table Top
	partition Top = calculated
		mode: import
		source = ROW ( "X", Fn.Table () )

table CG
	calculationGroup
		calculationItem Item = Fn.Item () + SELECTEDMEASURE ()
	column Name
		dataType: string

role R
	modelPermission: read
	tablePermission Sales = Fn.Role () = 1
`;
    const called = functions.replace(
      "function 'Fn.Outer' = () => 1",
      "function 'Fn.Outer' = () => Fn.Inner ()",
    );
    expect(findings(UDF_NOT_CALLED, tables, called)).toEqual([]);
  });

  it("does not count a call written inside a comment or a string", () => {
    const tables = `${sales}\tmeasure Note = "Local.Tax ( 1 )" // Local.Tax ( 2 )\n`;
    expect(
      findings(UDF_NOT_CALLED, tables, "function 'Local.Tax' = (x: NUMERIC) => x\n").map(
        (f) => f.name,
      ),
    ).toEqual(["Local.Tax"]);
  });

  it("does not follow a chain: a function that only an uncalled function calls is not reported", () => {
    const functions =
      "function 'Local.Inner' = () => 1\n\nfunction 'Local.Outer' = () => Local.Inner ()\n";
    expect(findings(UDF_NOT_CALLED, sales, functions).map((f) => f.name)).toEqual(["Local.Outer"]);
  });

  it("reports a DAX Lib package once, on its first function, when nothing outside it calls any of them", () => {
    const functions =
      packaged("Contoso.Tax.Rate", "() => 0.1") +
      packaged("Contoso.Tax.Apply", "(x: NUMERIC) => x * ( 1 + Contoso.Tax.Rate () )") +
      packaged("Contoso.Round.Two", "(x: NUMERIC) => ROUND ( x, 2 )", "Contoso.Round");
    expect(findings(UDF_NOT_CALLED, sales, functions)).toEqual([
      {
        name: "Contoso.Tax.Rate",
        type: "Function",
        detail: "package Contoso.Tax: none of its 2 functions is called",
        at: { file: "definition/functions.tmdl", line: 1 },
      },
      {
        name: "Contoso.Round.Two",
        type: "Function",
        detail: "package Contoso.Round: its one function is not called",
        at: { file: "definition/functions.tmdl", line: 15 },
      },
    ]);
  });

  it("reports no member of a package the model calls into, though most of its functions go uncalled", () => {
    const functions =
      packaged("Contoso.Tax.Rate", "() => 0.1") +
      packaged("Contoso.Tax.Apply", "(x: NUMERIC) => x * 1.1") +
      packaged("Contoso.Tax.Unused", "() => 0");
    const tables = `${sales}\tmeasure Taxed = Contoso.Tax.Apply ( [Total] )\n`;
    expect(findings(UDF_NOT_CALLED, tables, functions)).toEqual([]);
  });

  it("finds the two functions the UDF fixture leaves uncalled", () => {
    const model = buildModel(parseModelDir(`${fixturesDir}udf-sales.SemanticModel`));
    expect(
      UDF_NOT_CALLED.check({ model }, { indexes: buildIndexes({ model }), options: {} }).map(
        (f) => f.objectName,
      ),
    ).toEqual(["Time.YTD", "Plan.FreightVsBudget"]);
  });

  it("stays silent on a function that ignores it", () => {
    const functions =
      "function 'Local.Kept' = () => 1\n\tannotation pbiplint.ignore = UDF_NOT_CALLED\n";
    const ids = (text: string) =>
      lint(
        [
          { path: "definition/tables/Sales.tmdl", text: sales },
          { path: "definition/functions.tmdl", text },
        ],
        { rules: [UDF_NOT_CALLED] },
      ).findings.map((f) => f.ruleId);
    expect(ids(functions)).toEqual([]);
    expect(ids(functions.replace(/\tannotation .*\n/, ""))).toEqual(["UDF_NOT_CALLED"]);
  });
});

describe("UDF_USE_COMPOUND_NAMES", () => {
  it("is pbiplint's own info rule on the model's functions", () => {
    expect(UDF_USE_COMPOUND_NAMES).toMatchObject({
      id: "UDF_USE_COMPOUND_NAMES",
      name: "User-defined function with a one-word name",
      category: "Error Prevention",
      severity: 1,
      scope: ["Function"],
      layer: "model",
      needs: ["model"],
      status: "builtin",
    });
    expect(UDF_USE_COMPOUND_NAMES.skipWhenModelUnread).toBeUndefined();
  });

  it("reports a name with neither a dot nor an underscore, a package function's too", () => {
    const functions =
      "function AddTax = (x: NUMERIC) => x\n\nfunction 'Local.AddTax' = (x: NUMERIC) => x\n\nfunction add_tax = (x: NUMERIC) => x\n\nfunction _toggle = () => 1\n\n" +
      packaged("Round", "(x: NUMERIC) => ROUND ( x, 2 )");
    expect(findings(UDF_USE_COMPOUND_NAMES, sales, functions).map((f) => f.name)).toEqual([
      "AddTax",
      "Round",
    ]);
  });
});

describe("UDF_WITHOUT_DESCRIPTION", () => {
  it("is pbiplint's own info rule on the model's functions", () => {
    expect(UDF_WITHOUT_DESCRIPTION).toMatchObject({
      id: "UDF_WITHOUT_DESCRIPTION",
      name: "User-defined function with no description",
      category: "Maintenance",
      severity: 1,
      scope: ["Function"],
      layer: "model",
      needs: ["model"],
      status: "builtin",
    });
    expect(UDF_WITHOUT_DESCRIPTION.skipWhenModelUnread).toBeUndefined();
  });

  it("reports a function with no description or a blank one, and skips a DAX Lib package's", () => {
    const functions =
      "function 'Local.None' = () => 1\n\n///  \nfunction 'Local.Blank' = () => 2\n\n/// Rounds to cents.\nfunction 'Local.Round' = (x: NUMERIC) => ROUND ( x, 2 )\n\n" +
      packaged("Contoso.Tax.Rate", "() => 0.1");
    expect(findings(UDF_WITHOUT_DESCRIPTION, sales, functions).map((f) => f.name)).toEqual([
      "Local.None",
      "Local.Blank",
    ]);
  });

  it("reports nothing on a described function, nor on the UDF fixture, whose functions are all dotted and described", () => {
    expect(
      objectNames(
        UDF_WITHOUT_DESCRIPTION,
        "/// Described.\nfunction 'Local.Described' = () => 1\n",
      ),
    ).toEqual([]);
    const model = buildModel(parseModelDir(`${fixturesDir}udf-sales.SemanticModel`));
    for (const rule of [UDF_WITHOUT_DESCRIPTION, UDF_USE_COMPOUND_NAMES])
      expect(rule.check({ model }, { indexes: buildIndexes({ model }), options: {} })).toEqual([]);
  });
});

describe("the three function rules on a model with no functions", () => {
  it("report nothing", () => {
    const model = modelFrom(sales);
    for (const rule of [UDF_NOT_CALLED, UDF_USE_COMPOUND_NAMES, UDF_WITHOUT_DESCRIPTION])
      expect(rule.check({ model }, { indexes: buildIndexes({ model }), options: {} })).toEqual([]);
  });
});
