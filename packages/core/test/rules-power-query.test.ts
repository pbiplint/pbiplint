import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import {
  EXCEL_USE_HEADERS,
  LOCAL_DRIVE_PATH,
  ODBC_WHERE_CONNECTOR_EXISTS,
  PRIVACY_LEVELS_IGNORED,
  SCRIPT_IN_QUERY,
  SORT_NOT_HELD_FOR_REMOVE_DUPLICATES,
} from "../src/rules/pbiplint/power-query.js";
import type { Rule } from "../src/rules/types.js";
import { mFindings, modelFrom, mObjectNames } from "./helpers.js";

/** A table whose one M partition holds `m`, as Desktop writes a block: four tabs before each M line. */
const table = (name: string, ...m: string[]): string =>
  `table '${name}'\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n`;

/** What all of pbiplint's own Power Query rules share (v3 spec, section 9.1). */
function isPowerQueryRule(rule: Rule, severity: 1 | 2, category: string): void {
  expect(rule.status).toBe("builtin");
  expect(rule.layer).toBe("powerquery");
  expect(rule.needs).toEqual(["model"]);
  expect(rule.severity).toBe(severity);
  expect(rule.category).toBe(category);
}

describe("LOCAL_DRIVE_PATH (v3 spec, section 9.6)", () => {
  const rule = LOCAL_DRIVE_PATH;
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Path on a local drive");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports text that starts with a drive path, naming only the drive", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tSource = Csv.Document(File.Contents("C:\\Users\\someone\\Sales.csv"))',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 6, column: 42 },
        detail: "query 'Sales', step 'Source': the path is on a local drive (C:)",
      },
    ]);
  });
  it("reads a parameter's value, with either slash and either case of drive letter", async () => {
    const tmdl =
      'expression ExportFolder = "d:/Exports/" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n';
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "NamedExpression",
        objectName: "ExportFolder",
        location: { file: "inline.tmdl", line: 1, column: 27 },
        detail: "query 'ExportFolder': the path is on a local drive (D:)",
      },
    ]);
  });
  it("reports each piece of text, so two paths in one query are two findings", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tA = File.Contents("C:\\Demo\\Data\\A.csv"),',
      '\tB = File.Contents("C:\\Demo\\Data\\B.csv")',
      "in",
      "\tB",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Sales', step 'A': the path is on a local drive (C:)",
      "query 'Sales', step 'B': the path is on a local drive (C:)",
    ]);
  });
  it("leaves alone network paths, web and file addresses, comments, relative paths, a bare drive, and a joined path", async () => {
    const tmdl = table(
      "Sales",
      "let",
      "\t// Moved from C:\\Demo\\Data\\Old.csv",
      '\tNetwork = File.Contents("\\\\fileserver\\share\\Sales.csv"),',
      '\tWeb = Web.Contents("https://example.com/C:/Data/Sales.csv"),',
      '\tFileUrl = Web.Contents("file:///C:/Demo/Data/Sales.csv"),',
      '\tRelative = "Data\\Sales.csv",',
      '\tDrive = "C:",',
      '\tNoSlash = "C:Data",',
      '\tJoined = DataFolder & "Sales.csv"',
      "in",
      "\tJoined",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("does not read M that does not parse: PARSE_ISSUE reports it", async () => {
    const tmdl = table("Sales", 'File.Contents("C:\\Demo\\Data\\Sales.csv"');
    expect(await mObjectNames(rule, tmdl)).toEqual([]);
    const result = await lint([{ path: "definition/tables/Sales.tmdl", text: tmdl }]);
    expect(result.findings.map((f) => f.ruleId)).toContain("PARSE_ISSUE");
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
  });
  it("is silenced by an ignore annotation on the partition", async () => {
    const tmdl =
      'table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = File.Contents("C:\\Demo\\Data\\Sales.csv")\n\n\t\tannotation pbiplint.ignore = LOCAL_DRIVE_PATH\n';
    const result = await lint([{ path: "definition/tables/Sales.tmdl", text: tmdl }]);
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    const without = tmdl.replace("\n\t\tannotation pbiplint.ignore = LOCAL_DRIVE_PATH", "");
    const before = await lint([{ path: "definition/tables/Sales.tmdl", text: without }]);
    expect(before.findings.filter((f) => f.ruleId === rule.id)).toHaveLength(1);
  });
});

describe("SCRIPT_IN_QUERY (v3 spec, section 9.9)", () => {
  const rule = SCRIPT_IN_QUERY;
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Python or R script in a query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports each Python and R script call at its step, naming the language", async () => {
    const tmdl = table(
      "Scores",
      "let",
      '\tSource = #table({"Score"}, {{1}}),',
      "\t#\"Run Python script\" = Python.Execute(\"dataset['Score'] = dataset['Score'] * 2\", [dataset = Source]),",
      '\t#"Run R script" = R.Execute("output <- dataset", [dataset = Source])',
      "in",
      '\t#"Run R script"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Scores",
        location: { file: "inline.tmdl", line: 7, column: 29 },
        detail:
          "query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed",
      },
      {
        objectType: "Partition",
        objectName: "Scores",
        location: { file: "inline.tmdl", line: 8, column: 24 },
        detail:
          "query 'Scores', step 'Run R script': R.Execute refreshes only through a personal gateway on a machine with R installed",
      },
    ]);
  });
  it("leaves alone a script function passed as a value, and its name in text", async () => {
    const tmdl = table(
      "Scores",
      "let",
      "\tRun = List.Transform({}, Python.Execute),",
      '\tText = "Python.Execute(x)"',
      "in",
      "\tText",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});

describe("EXCEL_USE_HEADERS (v3 spec, section 9.12)", () => {
  const rule = EXCEL_USE_HEADERS;
  const book = 'Web.Contents("https://example.com/Budget.xlsx")';
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Error Prevention");
    expect(rule.name).toBe("Excel headers promoted by the workbook reader");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports useHeaders set to true, as an argument or in the options record, and nothing else", async () => {
    const tmdl = table(
      "Budget",
      "let",
      `\tReader = Excel.Workbook(${book}, true),`,
      `\tOption = Excel.Workbook(${book}, [UseHeaders = true]),`,
      `\tDesktop = Excel.Workbook(${book}, null, true),`,
      `\tOff = Excel.Workbook(${book}, false),`,
      `\tDelay = Excel.Workbook(${book}, [DelayTypes = true]),`,
      `\tBare = Excel.Workbook(${book})`,
      "in",
      "\tBare",
    );
    const what = "Excel.Workbook promotes headers in the refreshing machine's culture";
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Budget",
        location: { file: "inline.tmdl", line: 6, column: 15 },
        detail: `query 'Budget', step 'Reader': ${what}`,
      },
      {
        objectType: "Partition",
        objectName: "Budget",
        location: { file: "inline.tmdl", line: 7, column: 15 },
        detail: `query 'Budget', step 'Option': ${what}`,
      },
    ]);
  });
  it("reads true in parentheses, and leaves alone a value it would have to follow", async () => {
    const tmdl = table(
      "Budget",
      "let",
      "\tHeaders = true,",
      `\tWrapped = Excel.Workbook(${book}, (true)),`,
      `\tNamed = Excel.Workbook(${book}, Headers)`,
      "in",
      "\tNamed",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Budget', step 'Wrapped': Excel.Workbook promotes headers in the refreshing machine's culture",
    ]);
  });
});

describe("PRIVACY_LEVELS_IGNORED (v3 spec, section 9.8)", () => {
  const rule = PRIVACY_LEVELS_IGNORED;
  const run = (tmdl: string) => {
    const model = modelFrom(tmdl);
    return rule
      .check({ model }, { indexes: buildIndexes({ model }), options: {} })
      .map(({ object: _object, ...f }) => f);
  };
  const block = (...flags: string[]): string =>
    `model Model\n\tculture: en-US\n\tdataAccessOptions\n${flags.map((f) => `\t\t${f}\n`).join("")}`;
  it("is a built-in Power Query warning on the model", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Privacy levels ignored for this file");
    expect(rule.scope).toEqual(["Model"]);
  });
  it("reports fastCombine once, on its own line", () => {
    expect(run(block("fastCombine", "legacyRedirects", "returnErrorValuesAsNull"))).toEqual([
      {
        objectType: "Model",
        objectName: "Model",
        location: { file: "inline.tmdl", line: 4 },
        detail: "Ignore the Privacy Levels is on for this file; the service does not honor it",
      },
    ]);
  });
  it("leaves alone the flags Desktop writes by default, and a model without the block", () => {
    expect(run(block("legacyRedirects", "returnErrorValuesAsNull"))).toEqual([]);
    expect(run("model Model\n\tculture: en-US\n")).toEqual([]);
  });
  it("leaves alone fastCombine written with the value false", () => {
    expect(run(block("fastCombine: false"))).toEqual([]);
  });
  it("is silenced by an ignore annotation on the model", async () => {
    const tmdl = `${block("fastCombine")}\n\tannotation pbiplint.ignore = PRIVACY_LEVELS_IGNORED\n`;
    const result = await lint([{ path: "definition/model.tmdl", text: tmdl }]);
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    const before = await lint([{ path: "definition/model.tmdl", text: block("fastCombine") }]);
    expect(before.findings.filter((f) => f.ruleId === rule.id)).toHaveLength(1);
  });
});

describe("ODBC_WHERE_CONNECTOR_EXISTS (v3 spec, section 9.15)", () => {
  const rule = ODBC_WHERE_CONNECTOR_EXISTS;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Performance");
    expect(rule.name).toBe("ODBC or OLE DB where Power BI has a connector");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an ODBC driver Power BI has a connector for, at the call", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tSource = Odbc.DataSource("Driver={Amazon Redshift (x64)};Server=redshift.example;Database=dev", [HierarchicalNavigation = true])',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 6, column: 15 },
        detail:
          "query 'Orders', step 'Source': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector",
      },
    ]);
  });
  it("reads a connection string held by a step or a parameter, and an OLE DB provider", async () => {
    const tmdl =
      'expression OrdersDsn = "Driver={PostgreSQL Unicode(x64)};Server=pg.example;Database=sales" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
      table(
        "Orders",
        "let",
        '\tConnection = "Provider=MSOLEDBSQL;Data Source=sql.example;Initial Catalog=Sales",',
        "\tFromStep = OleDb.DataSource(Connection),",
        "\tFromParameter = Odbc.DataSource(OrdersDsn)",
        "in",
        "\tFromStep",
      );
    expect((await mFindings(rule, tmdl)).map((f) => [f.location, f.detail])).toEqual([
      [
        { file: "inline.tmdl", line: 9, column: 17 },
        "query 'Orders', step 'FromStep': the OLE DB connection names the SQL Server provider; Power BI has a SQL Server connector",
      ],
      [
        { file: "inline.tmdl", line: 10, column: 22 },
        "query 'Orders', step 'FromParameter': the ODBC connection names the PostgreSQL driver; Power BI has a PostgreSQL connector",
      ],
    ]);
  });
  it("reads the driver part however its key is written", async () => {
    const tmdl = table(
      "Orders",
      'Odbc.DataSource("DRIVER = {MySQL ODBC 8.0 Unicode Driver}; SERVER=mysql.example")',
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders': the ODBC connection names the MySQL driver; Power BI has a MySQL connector",
    ]);
  });
  it("reads SQLOLEDB, the older OLE DB provider, as SQL Server", async () => {
    const tmdl = table(
      "Orders",
      'OleDb.DataSource("Provider=SQLOLEDB.1;Data Source=sql.example;Initial Catalog=Sales")',
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders': the OLE DB connection names the SQL Server provider; Power BI has a SQL Server connector",
    ]);
  });
  it("leaves alone a DSN, a driver with no connector, a server's name, and a string built at refresh", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tDsn = Odbc.DataSource("dsn=Sales"),',
      '\tOther = Odbc.DataSource("Driver={SQLite3 ODBC Driver};Database=orders.db"),',
      '\tServerOnly = Odbc.DataSource("dsn=Sales;Server=sqlserver.example"),',
      '\tBuilt = Odbc.DataSource("Driver={" & "PostgreSQL" & "}")',
      "in",
      "\tDsn",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});

describe("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES (v3 spec, section 9.2)", () => {
  const rule = SORT_NOT_HELD_FOR_REMOVE_DUPLICATES;
  const customers =
    '\tSource = #table(type table [#"Customer ID" = text, Updated = date], {{"C1", #date(2025, 1, 1)}, {"C1", #date(2025, 2, 1)}}),';
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Sort may not decide which duplicate is kept");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports Desktop's Sorted Rows then Removed Duplicates on the Table.Distinct call, naming the sort's step", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\t#"Sorted Rows" = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      '\t#"Removed Duplicates" = Table.Distinct(#"Sorted Rows", {"Customer ID"})',
      "in",
      '\t#"Removed Duplicates"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Customers",
        location: { file: "inline.tmdl", line: 8, column: 30 },
        detail:
          "query 'Customers', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept",
      },
    ]);
  });
  it("reports the sort written in place, and a step that only renames the sort", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\tInPlace = Table.Distinct(Table.Sort(Source, {{"Updated", Order.Descending}}), {"Customer ID"}),',
      '\tSorted = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      "\tAgain = Sorted,",
      '\tRenamed = Table.Distinct(Again, {"Customer ID"})',
      "in",
      "\tRenamed",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Customers', step 'InPlace': nothing holds the order of the Table.Sort inside it, so the sort may not decide which duplicate is kept",
      "query 'Customers', step 'Renamed': nothing holds the order of step 'Sorted', so the sort may not decide which duplicate is kept",
    ]);
  });
  it("leaves alone a buffered sort, whole rows, a null column list, and a sort two steps back", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\tBuffered = Table.Buffer(Table.Sort(Source, {{"Updated", Order.Descending}})),',
      '\tFromBuffer = Table.Distinct(Buffered, {"Customer ID"}),',
      '\tSorted = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      "\tBufferedStep = Table.Buffer(Sorted),",
      '\tFromBufferedStep = Table.Distinct(BufferedStep, {"Customer ID"}),',
      "\tWholeRows = Table.Distinct(Sorted),",
      "\tNullColumns = Table.Distinct(Sorted, null),",
      '\tTyped = Table.TransformColumnTypes(Sorted, {{"Updated", type date}}),',
      '\tTwoBack = Table.Distinct(Typed, {"Customer ID"})',
      "in",
      "\tTwoBack",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("is silenced by an ignore annotation on the partition", async () => {
    const tmdl =
      'table Customers\n\tpartition Customers = m\n\t\tmode: import\n\t\tsource = Table.Distinct(Table.Sort(S, {"Updated"}), {"Customer ID"})\n\n\t\tannotation pbiplint.ignore = SORT_NOT_HELD_FOR_REMOVE_DUPLICATES\n';
    const result = await lint([{ path: "definition/tables/Customers.tmdl", text: tmdl }]);
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    const without = tmdl.replace(
      "\n\t\tannotation pbiplint.ignore = SORT_NOT_HELD_FOR_REMOVE_DUPLICATES",
      "",
    );
    const before = await lint([{ path: "definition/tables/Customers.tmdl", text: without }]);
    expect(before.findings.filter((f) => f.ruleId === rule.id)).toHaveLength(1);
  });
});
