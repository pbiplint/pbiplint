import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { englishList, HARDCODED_PERIOD_IN_DAX, namesYear } from "../src/rules/pbiplint/periods.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { examplesDir, fixturesDir, modelFrom, parseModelDir } from "./helpers.js";

const check = (model: Model) =>
  HARDCODED_PERIOD_IN_DAX.check({ model }, { indexes: buildIndexes({ model }), options: {} });
const run = (tmdl: string) =>
  check(modelFrom(tmdl)).map((f) => ({
    type: f.objectType,
    name: f.objectName,
    line: f.location?.line,
    detail: f.detail,
  }));
/** A Sales table, four lines long, before the lines given. */
const sales = (lines: string) =>
  `table Sales\n\tcolumn 'Order Date'\n\t\tdataType: dateTime\n\t\tsourceColumn: Order Date\n${lines}`;
/** A calculated table, its source on line 7. `name` is written as TMDL needs it. */
const dateTable = (name: string, source: string) =>
  `table ${name}\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tsourceColumn: [Date]\n\tpartition ${name} = calculated\n\t\tmode: import\n\t\tsource = ${source}\n`;

describe("HARDCODED_PERIOD_IN_DAX", () => {
  it("is pbiplint's own info rule on the model, with no skip for a partly read model", () => {
    expect(HARDCODED_PERIOD_IN_DAX).toMatchObject({
      id: "HARDCODED_PERIOD_IN_DAX",
      name: "Hardcoded period in DAX",
      category: "DAX Expressions",
      severity: 1,
      scope: ["Measure", "CalculatedColumn", "CalculationItem", "CalculatedTable"],
      layer: "model",
      needs: ["model"],
      status: "builtin",
    });
    expect(HARDCODED_PERIOD_IN_DAX.skipWhenModelUnread).toBeUndefined();
    expect(HARDCODED_PERIOD_IN_DAX.options).toBeUndefined();
  });

  it("reports a measure, a calculated column, and a calculation item once each, at the period's line", () => {
    const tmdl =
      sales(
        "\tmeasure 'Current Sales' = CALCULATE([Total], 'Sales'[Year] = 2025, 'Sales'[Year] <> 2024)\n" +
          "\tcolumn 'Is Recent' = YEAR('Sales'[Order Date]) IN {2024, 2025}\n\t\tdataType: boolean\n",
      ) +
      "table 'Time Calc'\n\tcalculationGroup\n\t\tcalculationItem 'This Year' = CALCULATE(SELECTEDMEASURE(), 'Date'[Year] = 2025)\n\tcolumn Name\n\t\tdataType: string\n";
    expect(run(tmdl)).toEqual([
      { type: "Measure", name: "[Current Sales]", line: 5, detail: "fixed years 2025 and 2024" },
      {
        type: "CalculatedColumn",
        name: "'Sales'[Is Recent]",
        line: 6,
        detail: "fixed years 2024 and 2025",
      },
      {
        type: "CalculationItem",
        name: "This Year",
        line: 10,
        detail: "fixed year 2025 in calculation group 'Time Calc'",
      },
    ]);
  });

  it("points at the line of the first period in a block, a fence, and a part of a split table", () => {
    const block = sales(
      "\tmeasure Stale =\n\t\t\tVAR x = [Total]\n\t\t\tRETURN\n\t\t\t\tCALCULATE(x, 'Sales'[Year] = 2025)\n",
    );
    expect(run(block).map((f) => f.line)).toEqual([8]);
    const fenced = sales(
      "\tmeasure Stale = ```\n\t\t\tCALCULATE([Total],\n\t\t\t\t'Sales'[Year] = 2025)\n\t\t\t```\n",
    );
    expect(run(fenced).map((f) => f.line)).toEqual([7]);
    const split = buildModel([
      parseTmdl("tables/Sales.tmdl", sales("\tmeasure Total = SUM('Sales'[Amount])\n")),
      parseTmdl(
        "tables/Sales more.tmdl",
        "table Sales\n\n\tmeasure Stale = CALCULATE([Total], 'Sales'[Year] = 2025)\n",
      ),
    ]);
    expect(check(split).map((f) => f.location)).toEqual([
      { file: "tables/Sales more.tmdl", line: 3 },
    ]);
  });

  it("points a date table's finding at the file and line of its partition's source when the partition sits in another file", () => {
    const model = buildModel([
      parseTmdl(
        "tables/Date.tmdl",
        "table Date\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tsourceColumn: [Date]\n",
      ),
      parseTmdl(
        "tables/Date partition.tmdl",
        "table Date\n\n\tpartition Date = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t\tCALENDAR(\n\t\t\t\t\tDATE(2020, 1, 1),\n\t\t\t\t\tDATE(2026, 12, 31)\n\t\t\t\t)\n",
      ),
    ]);
    expect(check(model).map((f) => [f.objectName, f.location])).toEqual([
      ["'Date'", { file: "tables/Date partition.tmdl", line: 8 }],
    ]);
  });

  it("falls back to the object's own location when its node records no value line", () => {
    const model = modelFrom(
      sales("\tmeasure Stale =\n\t\t\tCALCULATE([Total],\n\t\t\t\t'Sales'[Year] = 2025)\n"),
    );
    const measure = model.tables[0]!.measures[0]!;
    expect(check(model).map((f) => f.location)).toEqual([{ file: "inline.tmdl", line: 7 }]);
    delete measure.node!.valueLine;
    expect(check(model).map((f) => f.location)).toEqual([measure.location]);
    expect(measure.location.line).toBe(5);
  });

  it("names years, days, or both in the detail", () => {
    const details = run(
      sales(
        "\tmeasure A = CALCULATE([Total], 'Sales'[Order Date] >= DATE(2024, 1, 1), 'Sales'[Order Date] <= DATE(2024, 12, 31))\n" +
          "\tmeasure B = CALCULATE([Total], 'Sales'[Year] = 2025, 'Sales'[Order Date] <= DATE(2024, 12, 31))\n" +
          "\tmeasure C = CALCULATE([Total], 'Sales'[Year] IN {2020, 2021, 2022, 2023, 2024, 2025})\n" +
          "\tmeasure D = IF('Sales'[Year] = 2025, 1, IF(YEAR(MAX('Sales'[Order Date])) = 2025, 2))\n",
      ),
    ).map((f) => f.detail);
    expect(details).toEqual([
      "fixed dates January 1, 2024 and December 31, 2024",
      "fixed periods 2025 and December 31, 2024",
      "fixed years 2020, 2021, 2022, and 3 more",
      "fixed year 2025",
    ]);
  });

  it("leaves alone an object whose name carries one of its years, in four digits or two", () => {
    const names = run(
      sales(
        "\tmeasure 'Total Sales 2026' = CALCULATE([Total], YEAR('Sales'[Order Date]) = 2026)\n" +
          "\tmeasure 'Growth from 19/20' = CALCULATE([Total], 'Sales'[Year] = 2019)\n" +
          "\tmeasure 'Top 10 Sales' = CALCULATE([Total], 'Sales'[Year] = 2025)\n",
      ),
    ).map((f) => f.name);
    expect(names).toEqual(["[Top 10 Sales]"]);
  });

  it("does not read a format string expression", () => {
    const tmdl = sales(
      `\tmeasure Total = SUM('Sales'[Amount])\n\t\tformatStringDefinition = IF('Sales'[Year] = 2025, "0", "0.0")\n`,
    );
    expect(run(tmdl)).toEqual([]);
  });

  it("reports a date table whose CALENDAR ends on a fixed date, at the line where the day is written", () => {
    expect(run(dateTable("Date", "CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))"))).toEqual([
      {
        type: "CalculatedTable",
        name: "'Date'",
        line: 7,
        detail: "ends on a fixed date, December 31, 2026",
      },
    ]);
    const viaVariable =
      "\n\t\t\t\tVAR StartDate = DATE(2020, 1, 1)\n\t\t\t\tVAR EndDate = DATE(2025, 12, 31)\n\t\t\t\tRETURN CALENDAR(StartDate, EndDate)";
    expect(run(dateTable("Date", viaVariable)).map((f) => [f.line, f.detail])).toEqual([
      [9, "ends on a fixed date, December 31, 2025"],
    ]);
    expect(run(dateTable("Date", `CALENDAR("2020-01-01", "01/02/2026")`))[0]!.detail).toBe(
      `ends on a fixed date, "01/02/2026"`,
    );
    const two =
      "UNION(CALENDAR(DATE(2020, 1, 1), DATE(2025, 12, 31)), CALENDAR(DATE(2026, 1, 1), DATE(2026, 12, 31)))";
    expect(run(dateTable("Date", two))[0]!.detail).toBe(
      "ends on fixed dates December 31, 2025 and December 31, 2026",
    );
  });

  it("leaves alone a dynamic end, Desktop's auto date tables, a table named for its end, and other calculated tables", () => {
    const fixed = "CALENDAR(DATE(2015, 1, 1), DATE(2015, 1, 1))";
    for (const tmdl of [
      dateTable("Date", "CALENDAR(DATE(2020, 1, 1), MAX('Sales'[Order Date]))"),
      dateTable("DateTableTemplate_96ead6f8", fixed),
      dateTable("LocalDateTable_ef30d063", fixed),
      dateTable("'Calendar 2026'", "CALENDAR(DATE(2026, 1, 1), DATE(2026, 12, 31))"),
      dateTable("Recent", "FILTER('Sales', YEAR('Sales'[Order Date]) = 2025)"),
      dateTable("Days", `DATATABLE("Day", DATETIME, {{DATE(2025, 1, 1)}})`),
    ])
      expect(run(tmdl), tmdl).toEqual([]);
  });

  it("stays silent on an object that ignores it", () => {
    const text = sales(
      "\tmeasure Stale = CALCULATE([Total], 'Sales'[Year] = 2025)\n\t\tannotation pbiplint.ignore = HARDCODED_PERIOD_IN_DAX\n",
    );
    const ids = (t: string) =>
      lint([{ path: "definition/tables/Sales.tmdl", text: t }], {
        rules: [HARDCODED_PERIOD_IN_DAX],
      }).findings.map((f) => f.ruleId);
    expect(ids(text)).toEqual([]);
    expect(ids(text.replace(/\t\tannotation .*\n/, ""))).toEqual(["HARDCODED_PERIOD_IN_DAX"]);
  });

  it("finds nothing in the sample's and the fixtures' models", () => {
    const modelDirs = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .flatMap((e) =>
          e.name.endsWith(".SemanticModel") ? [join(dir, e.name)] : modelDirs(join(dir, e.name)),
        );
    const dirs = [...modelDirs(fixturesDir), ...modelDirs(examplesDir)];
    expect(dirs.length).toBeGreaterThan(5);
    for (const dir of dirs) expect(check(buildModel(parseModelDir(dir))), dir).toEqual([]);
    const specSample = readFileSync(join(fixturesDir, "spec-sample.tmdl"), "utf8");
    expect(check(buildModel([parseTmdl("spec-sample.tmdl", specSample)]))).toEqual([]);
  });
});

describe("namesYear", () => {
  it("reads a year in a name as its four digits, or its last two with no digit beside them", () => {
    expect(namesYear("Values2025", 2025)).toBe(true);
    expect(namesYear("discharged_on_or_after_01042022", 2022)).toBe(true);
    expect(namesYear("Average Daily Calls Jan-24 to Dec-24", 2024)).toBe(true);
    expect(namesYear("% Frail 2021/22", 2022)).toBe(true);
    expect(namesYear("24", 2024)).toBe(true);
    expect(namesYear("Top 125 Sales", 2025)).toBe(false);
    expect(namesYear("Sales 2024", 2025)).toBe(false);
    expect(namesYear("Anything", 50)).toBe(false);
  });
});

describe("englishList", () => {
  it("lists as English does, with semicolons between items that hold commas, and names three at most", () => {
    expect(englishList(["2025"])).toBe("2025");
    expect(englishList(["2024", "2025"])).toBe("2024 and 2025");
    expect(englishList(["2024", "2025", "2026"])).toBe("2024, 2025, and 2026");
    expect(englishList(["January 1, 2024", "June 30, 2024", "December 31, 2024"])).toBe(
      "January 1, 2024; June 30, 2024; and December 31, 2024",
    );
    expect(englishList(["2020", "2021", "2022", "2023", "2024", "2025"])).toBe(
      "2020, 2021, 2022, and 3 more",
    );
  });
});
