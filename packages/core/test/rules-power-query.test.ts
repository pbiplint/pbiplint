import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import {
  DEFAULT_STEP_NAMES,
  DYNAMIC_DATA_SOURCE,
  EXCEL_USE_HEADERS,
  EXTENSION_FILTER_CASE,
  FIXED_DATE_IN_ROW_FILTER,
  HARDCODED_SECRET_IN_QUERY,
  HARDCODED_SERVER_NAME,
  INCREMENTAL_REFRESH_RANGE_BOUNDS,
  KEEP_FIRST_ROWS_LEFT_IN,
  LEGACY_EXCEL_FILE,
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
function isPowerQueryRule(rule: Rule, severity: 1 | 2 | 3, category: string): void {
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
  it("leaves alone a sort only on columns that also decide what is a duplicate", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\tSorted = Table.Sort(Source, {{"Customer ID", Order.Ascending}}),',
      '\tPairs = Table.Distinct(Sorted, {"Customer ID"}),',
      '\tSortedText = Table.Sort(Source, "Customer ID"),',
      '\tText = Table.Distinct(SortedText, {"Customer ID"}),',
      '\tSortedPair = Table.Sort(Source, {"Customer ID", Order.Descending}),',
      '\tPair = Table.Distinct(SortedPair, {"Customer ID", "Updated"}),',
      '\tSortedList = Table.Sort(Source, {"Updated", "Customer ID"}),',
      '\tList = Table.Distinct(SortedList, {"Customer ID", "Updated"})',
      "in",
      "\tList",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("reports a sort on a column outside the duplicate key, a distinct with a comparer, and a sort it cannot read", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\tSorted = Table.Sort(Source, {"Customer ID", "Updated"}),',
      '\tOutside = Table.Distinct(Sorted, {"Customer ID"}),',
      '\tSortedKey = Table.Sort(Source, {{"Customer ID", Order.Ascending}}),',
      '\tComparer = Table.Distinct(SortedKey, {"Customer ID", Comparer.OrdinalIgnoreCase}),',
      "\tSortedBy = Table.Sort(Source, SortColumns),",
      '\tUnread = Table.Distinct(SortedBy, {"Customer ID"})',
      "in",
      "\tUnread",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail!.split(":")[0])).toEqual([
      "query 'Customers', step 'Outside'",
      "query 'Customers', step 'Comparer'",
      "query 'Customers', step 'Unread'",
    ]);
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

describe("KEEP_FIRST_ROWS_LEFT_IN (v3 spec, section 9.11)", () => {
  const rule = KEEP_FIRST_ROWS_LEFT_IN;
  const orders =
    "\tSource = #table(type table [OrderID = number, Amount = number], {{1, 10}, {2, 20}}),";
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Keep First Rows left in a loaded query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a Keep First Rows step in a partition, with its count", async () => {
    const tmdl = table(
      "Orders",
      "let",
      orders,
      '\t#"Kept First Rows" = Table.FirstN(Source, 1000)',
      "in",
      '\t#"Kept First Rows"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 7, column: 27 },
        detail: "query 'Orders', step 'Kept First Rows': only the first 1000 rows load",
      },
    ]);
  });
  it("leaves alone a top N after a sort or a buffered sort, a count of 0 or 1, a count not written as a number, and a top N per group", async () => {
    const tmdl = table(
      "Orders",
      "let",
      orders,
      '\tTopTen = Table.FirstN(Table.Sort(Source, {{"Amount", Order.Descending}}), 10),',
      '\tSorted = Table.Buffer(Table.Sort(Source, {{"Amount", Order.Descending}})),',
      "\tTopFive = Table.FirstN(Sorted, 5),",
      "\tSchemaOnly = Table.FirstN(Source, 0),",
      "\tSettings = Table.FirstN(Source, 1),",
      "\tFromParameter = Table.FirstN(Source, RowLimit),",
      "\tWhile = Table.FirstN(Source, each [Amount] > 0),",
      '\tPerGroup = Table.Group(Source, {"OrderID"}, {{"Top", each Table.FirstN(_, 3), type table}})',
      "in",
      "\tPerGroup",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("reports a refresh policy's own query on the Table", async () => {
    const tmdl =
      'table Orders\n\tpartition Orders = m\n\t\tmode: import\n\t\tsource = Sql.Database("db.example", "Warehouse")\n\n' +
      "\trefreshPolicy\n\t\tpolicyType: basic\n\t\tsourceExpression = Table.FirstN(Source, 1000)\n";
    // The policy's query differs from its partition's, so it is read (v3 spec, section 5.1).
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Table",
        objectName: "'Orders'",
        location: { file: "inline.tmdl", line: 8, column: 22 },
        detail: "query 'Orders': only the first 1000 rows load",
      },
    ]);
  });
  it("leaves alone a shared expression, which does not load", async () => {
    const tmdl = 'expression Preview =\n\t\tTable.FirstN(#table({"OrderID"}, {{1}}), 1000)\n';
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});

describe("INCREMENTAL_REFRESH_RANGE_BOUNDS (v3 spec, section 9.4)", () => {
  const rule = INCREMENTAL_REFRESH_RANGE_BOUNDS;
  const parameters =
    'expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n' +
    'expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n';
  /** A Sales partition filtered with `condition`, beside the model's RangeStart and RangeEnd. */
  const filtered = (condition: string, ...before: string[]): string =>
    parameters +
    table(
      "Sales",
      "let",
      "\tSource = #table(type table [OrderDate = datetime], {}),",
      ...before,
      `\t#"Filtered Rows" = Table.SelectRows(Source, each ${condition})`,
      "in",
      '\t#"Filtered Rows"',
    );
  it("is a built-in Power Query error on a query's owner", () => {
    isPowerQueryRule(rule, 3, "Error Prevention");
    expect(rule.name).toBe("Incremental refresh filter counts a boundary row twice or never");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports both bounds included, on the RangeEnd comparison", async () => {
    expect(
      await mFindings(rule, filtered("[OrderDate] >= RangeStart and [OrderDate] <= RangeEnd")),
    ).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 11, column: 85 },
        detail:
          "query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions",
      },
    ]);
  });
  it("reports neither bound included, on the RangeStart comparison", async () => {
    const [f] = await mFindings(
      rule,
      filtered("[OrderDate] > RangeStart and [OrderDate] < RangeEnd"),
    );
    expect(f?.location).toEqual({ file: "inline.tmdl", line: 11, column: 55 });
    expect(f?.detail).toBe(
      "query 'Sales', step 'Filtered Rows': neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none",
    );
  });
  it("reads a comparison with the parameter first, inside a call, or held by a step", async () => {
    const details = async (condition: string, ...before: string[]) =>
      (await mFindings(rule, filtered(condition, ...before))).map(
        (f) => f.detail!.split(": ")[1]!.split(" ")[0],
      );
    expect(await details("RangeStart <= [OrderDate] and RangeEnd >= [OrderDate]")).toEqual([
      "both",
    ]);
    expect(await details("[Key] > DateKey(RangeStart) and [Key] < DateKey(RangeEnd)")).toEqual([
      "neither",
    ]);
    expect(
      await details("[OrderDate] >= Start and [OrderDate] <= RangeEnd", "\tStart = RangeStart,"),
    ).toEqual(["both"]);
  });
  it("leaves alone one bound included, one parameter only, a shadowed parameter, and both kinds on one parameter", async () => {
    expect(
      await mFindings(rule, filtered("[OrderDate] >= RangeStart and [OrderDate] < RangeEnd")),
    ).toEqual([]);
    expect(
      await mFindings(rule, filtered("[Key] > DateKey(RangeStart) and [Key] <= DateKey(RangeEnd)")),
    ).toEqual([]);
    expect(await mFindings(rule, filtered("[OrderDate] >= RangeStart"))).toEqual([]);
    expect(
      await mFindings(
        rule,
        filtered(
          "[OrderDate] >= RangeStart and [OrderDate] <= RangeEnd",
          "\tRangeEnd = #datetime(2030, 1, 1, 0, 0, 0),",
        ),
      ),
    ).toEqual([]);
    expect(
      await mFindings(
        rule,
        filtered(
          "[OrderDate] >= RangeStart and [OrderDate] > RangeStart and [OrderDate] <= RangeEnd",
        ),
      ),
    ).toEqual([]);
  });
  it("reports a refresh policy whose query matches its partition once, on the partition", async () => {
    const m = [
      "let",
      "\tSource = #table(type table [OrderDate = datetime], {}),",
      '\t#"Filtered Rows" = Table.SelectRows(Source, each [OrderDate] >= RangeStart and [OrderDate] <= RangeEnd)',
      "in",
      '\t#"Filtered Rows"',
    ];
    const tmdl =
      parameters +
      `table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n` +
      `\trefreshPolicy\n\t\tpolicyType: basic\n\t\tsourceExpression =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n`;
    expect((await mFindings(rule, tmdl)).map((f) => f.objectType)).toEqual(["Partition"]);
  });
});

describe("FIXED_DATE_IN_ROW_FILTER (v3 spec, section 9.16)", () => {
  const rule = FIXED_DATE_IN_ROW_FILTER;
  /** A Sales partition filtered with `condition`. */
  const filtered = (condition: string, extra = ""): string =>
    extra +
    table(
      "Sales",
      "let",
      '\tSource = #table(type table [#"Order Date" = date], {}),',
      `\t#"Filtered Rows" = Table.SelectRows(Source, each ${condition})`,
      "in",
      '\t#"Filtered Rows"',
    );
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Maintenance");
    expect(rule.name).toBe("Fixed date in a row filter");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a fixed end on the date, written long form", async () => {
    expect(await mFindings(rule, filtered("[Order Date] <= #date(2025, 12, 31)"))).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 7, column: 71 },
        detail: "query 'Sales', step 'Filtered Rows': rows end at a fixed date, December 31, 2025",
      },
    ]);
  });
  it("reads <, =, the date first, #datetime, and #datetimezone with a negative offset", async () => {
    const details = async (condition: string) =>
      (await mFindings(rule, filtered(condition))).map((f) => f.detail!.split(": ")[1]);
    expect(await details("[Order Date] < #datetime(2026, 1, 1, 0, 0, 0)")).toEqual([
      "rows end at a fixed date, January 1, 2026",
    ]);
    expect(await details("[Month] = #date(2026, 3, 1) or [Month] = #date(2026, 3, 31)")).toEqual([
      "rows match a fixed date, March 1, 2026",
      "rows match a fixed date, March 31, 2026",
    ]);
    expect(await details("#datetimezone(2025, 6, 30, 0, 0, 0, -5, 0) >= [Order Date]")).toEqual([
      "rows end at a fixed date, June 30, 2025",
    ]);
  });
  it("leaves alone a fixed start, a date left out with <>, a date from a parameter or from now, and a filter on the refresh range", async () => {
    expect(await mFindings(rule, filtered("[Order Date] >= #date(2020, 1, 1)"))).toEqual([]);
    expect(await mFindings(rule, filtered("[Order Date] <> #date(1900, 1, 1)"))).toEqual([]);
    expect(await mFindings(rule, filtered("[Order Date] <= #date(EndYear, 12, 31)"))).toEqual([]);
    expect(
      await mFindings(rule, filtered("[Order Date] <= Date.From(DateTime.LocalNow())")),
    ).toEqual([]);
    const parameters =
      'expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n';
    expect(
      await mFindings(
        rule,
        filtered("[Order Date] >= RangeStart and [Order Date] < #date(2030, 1, 1)", parameters),
      ),
    ).toEqual([]);
  });
  it("leaves alone a fixed date outside a row filter, and a table partitioned by hand", async () => {
    const column = table(
      "Sales",
      "let",
      '\tSource = #table(type table [#"Order Date" = date], {}),',
      '\tFlagged = Table.AddColumn(Source, "Old", each [Order Date] < #date(2025, 1, 1))',
      "in",
      "\tFlagged",
    );
    expect(await mFindings(rule, column)).toEqual([]);
    const slice = (year: number) =>
      `\tpartition 'Sales ${year}' = m\n\t\tmode: import\n\t\tsource = Table.SelectRows(S, each [Order Date] >= #date(${year}, 1, 1) and [Order Date] <= #date(${year}, 12, 31))\n`;
    expect(await mFindings(rule, `table Sales\n${slice(2024)}${slice(2025)}`)).toEqual([]);
  });
});

describe("DEFAULT_STEP_NAMES (v3 spec, section 9.13)", () => {
  const rule = DEFAULT_STEP_NAMES;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Maintenance");
    expect(rule.name).toBe("Steps keep Power Query's default names");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a query once, on its first default name, with the count and two names", async () => {
    const tmdl = table(
      "Sales",
      "let",
      "\tSource = #table(type table [Amount = number], {{1}}),",
      '\t#"Changed Type" = Table.TransformColumnTypes(Source, {{"Amount", type number}}),',
      '\t#"Added Custom1" = Table.AddColumn(#"Changed Type", "Doubled", each [Amount] * 2),',
      '\t#"Expanded Orders" = #"Added Custom1",',
      '\tCustom = #"Expanded Orders"',
      "in",
      "\tCustom",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 7, column: 6 },
        detail:
          "query 'Sales': 4 steps keep default names, such as 'Changed Type' and 'Added Custom1'",
      },
    ]);
  });
  it("words one and two names as English does", async () => {
    const one = table("Sales", "let", '\t#"Filtered Rows" = 1', "in", '\t#"Filtered Rows"');
    expect((await mFindings(rule, one)).map((f) => f.detail)).toEqual([
      "query 'Sales': 1 step keeps its default name, 'Filtered Rows'",
    ]);
    const two = table(
      "Sales",
      "let",
      '\t#"Promoted Headers" = 1,',
      '\t#"Changed Type with Locale" = 2',
      "in",
      '\t#"Changed Type with Locale"',
    );
    expect((await mFindings(rule, two)).map((f) => f.detail)).toEqual([
      "query 'Sales': 2 steps keep default names, 'Promoted Headers' and 'Changed Type with Locale'",
    ]);
  });
  it("reads a shared expression's steps too", async () => {
    const tmdl =
      'expression Staging =\n\t\tlet\n\t\t\t#"Removed Errors" = 1\n\t\tin\n\t\t\t#"Removed Errors"\n';
    expect((await mFindings(rule, tmdl)).map((f) => [f.objectType, f.detail])).toEqual([
      ["NamedExpression", "query 'Staging': 1 step keeps its default name, 'Removed Errors'"],
    ]);
  });
  it("leaves alone Source and Navigation, renamed steps, names that only start like a default, nested lets, parameters, and functions", async () => {
    const tmdl =
      'expression Limit = 10 meta [IsParameterQuery = true, Type = "Number", IsParameterQueryRequired = true]\n\n' +
      'expression GetPage = (url as text) => let #"Changed Type" = 1 in #"Changed Type"\n\n' +
      table(
        "Sales",
        "let",
        "\tSource = 1,",
        "\tNavigation = Source,",
        "\tTypedAmount = Navigation,",
        '\t#"Changed Types Of Amount" = TypedAmount,',
        "\tExpandedRows = 1,",
        '\tInner = let #"Added Custom" = 1 in #"Added Custom"',
        "in",
        "\tInner",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});

describe("DYNAMIC_DATA_SOURCE (v3 spec, section 9.3)", () => {
  const rule = DYNAMIC_DATA_SOURCE;
  const base =
    'expression ApiBase = "https://api.example.com" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\nexpression DataFolder = "C:\\Demo\\Data\\" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n';
  it("is a built-in Power Query error on a query's owner", () => {
    isPowerQueryRule(rule, 3, "Error Prevention");
    expect(rule.name).toBe("Data source the service can't refresh");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an address read from the rows, on the call", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tSource = #table(type table [url = text], {{"https://api.example.com/v1/orders/1"}}),',
      '\t#"Added Custom" = Table.AddColumn(Source, "Body", each Web.Contents([url]))',
      "in",
      '\t#"Added Custom"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 7, column: 61 },
        detail: "query 'Orders', step 'Added Custom': Web.Contents's address is read from the rows",
      },
    ]);
  });
  it("reports an address built by a function call, naming what each function calls its address", async () => {
    const tmdl =
      base +
      table(
        "Orders",
        "let",
        '\tBuilt = File.Contents(Text.Combine({DataFolder, "orders.csv"})),',
        "\tListed = Folder.Files(Text.Lower(DataFolder)),",
        '\tServer = Sql.Database(Text.Upper("sql.example"), "Warehouse"),',
        '\tOdbc = Odbc.DataSource(Text.Combine({"dsn=", "Sales"})),',
        '\tWeb = Web.Contents(Uri.Combine(ApiBase, "v1"))',
        "in",
        "\tWeb",
      );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders', step 'Built': File.Contents's path is built by a function call",
      "query 'Orders', step 'Listed': Folder.Files's path is built by a function call",
      "query 'Orders', step 'Server': Sql.Database's server is built by a function call",
      "query 'Orders', step 'Odbc': Odbc.DataSource's connection string is built by a function call",
      "query 'Orders', step 'Web': Web.Contents's address is built by a function call",
    ]);
  });
  it("leaves alone literals, parameters, joins of them, steps that hold them, and RelativePath and Query", async () => {
    const tmdl =
      base +
      table(
        "Orders",
        "let",
        '\tArchive = "C:\\Demo\\Data\\orders.csv",',
        "\tNested = let Inner = let Read = File.Contents(Archive) in Read in Inner,",
        '\tJoined = Web.Contents(ApiBase & "/v1/orders"),',
        '\tRelative = Web.Contents(ApiBase, [RelativePath = "v1/orders/" & Text.From(1), Query = [page = Text.From(2)]]),',
        '\tFolder = Folder.Files(DataFolder & "Sales")',
        "in",
        "\tFolder",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("reports an address chosen with if, whatever its branches, and a custom function's parameter, as Desktop does", async () => {
    const tmdl =
      base +
      "expression GetPage = (address as text) => Web.Contents(address)\n\n" +
      "expression GetFile = (settings as record) => File.Contents(settings[Path])\n\n" +
      table(
        "Orders",
        "let",
        '\tAddress = if ApiBase = "" then "https://test.example.com" else ApiBase,',
        "\tChosen = Web.Contents(Address),",
        '\tGuarded = Web.Contents(if ApiBase = "" then error Error.Record("Missing", "Set ApiBase") else ApiBase),',
        '\tAlways = Web.Contents(if true then "https://api.example.com" else "https://test.example.com"),',
        '\tJoined = Folder.Files(DataFolder & (if ApiBase = "" then "Test" else "Prod")),',
        '\tRelative = Web.Contents(ApiBase, [RelativePath = if ApiBase = "" then "test" else "v1"]),',
        '\tThroughFunction = GetPage("https://api.example.com/v1/customers")',
        "in",
        "\tThroughFunction",
      );
    expect(
      (await mFindings(rule, tmdl)).map((f) => [f.objectName, f.location?.line, f.detail]),
    ).toEqual([
      [
        "Orders",
        15,
        "query 'Orders', step 'Chosen': Web.Contents's address is chosen with if ... then ... else",
      ],
      [
        "Orders",
        16,
        "query 'Orders', step 'Guarded': Web.Contents's address is chosen with if ... then ... else",
      ],
      [
        "Orders",
        17,
        "query 'Orders', step 'Always': Web.Contents's address is chosen with if ... then ... else",
      ],
      [
        "Orders",
        18,
        "query 'Orders', step 'Joined': Folder.Files's path is chosen with if ... then ... else",
      ],
      ["GetPage", 5, "query 'GetPage': Web.Contents's address is a custom function's parameter"],
      ["GetFile", 7, "query 'GetFile': File.Contents's path is a custom function's parameter"],
    ]);
  });
  it("leaves alone a function that is not a data source, and an address it cannot follow", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tSource = Json.Document(Text.Combine({"{", "}"})),',
      "\tUnknown = Web.Contents(Nowhere)",
      "in",
      "\tUnknown",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});

describe("HARDCODED_SECRET_IN_QUERY (v3 spec, sections 9.5 and 11.3)", () => {
  const rule = HARDCODED_SECRET_IN_QUERY;
  /** A model parameter holding text, as Desktop writes one. */
  const parameter = (name: string, value: string): string =>
    `expression ${name} = "${value}" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n`;
  it("is a built-in Power Query error on a query's owner", () => {
    isPowerQueryRule(rule, 3, "Error Prevention");
    expect(rule.name).toBe("Secret written into a query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an Authorization header on its text, once, though it is a Bearer token too", async () => {
    const tmdl = table(
      "Orders API",
      "let",
      '\tSource = Web.Contents("https://api.example.com/v1/orders", [Headers = [Authorization = "Bearer pbiplint-fixture-token-0101-notreal"]])',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders API",
        location: { file: "inline.tmdl", line: 6, column: 93 },
        detail:
          "query 'Orders API', step 'Source': the Authorization header in Web.Contents holds a credential written into the query (value not shown)",
      },
    ]);
  });
  it("reads every place spec 9.5 names, with names in any case", async () => {
    const tmdl = table(
      "Orders API",
      "let",
      '\tHeader = Web.Contents("https://api.example.com/v1", [Headers = [#"X-API-Key" = "pbiplint-fixture-key-0102-notreal"]]),',
      '\tField = Web.Contents("https://api.example.com/v1", [Query = [access_token = "pbiplint-fixture-token-0103-notreal"]]),',
      '\tAddress = Web.Contents("https://api.example.com/v1?format=json&Sig=pbiplint-fixture-sig-0104-notreal"),',
      '\tFeedHeaders = OData.Feed("https://odata.example.com", [#"Ocp-Apim-Subscription-Key" = "pbiplint-fixture-key-0105-notreal"]),',
      '\tFeedOptions = OData.Feed("https://odata.example.com", null, [Headers = [#"x-functions-key" = "pbiplint-fixture-key-0106-notreal"]]),',
      '\tToken = "Bearer pbiplint-fixture-token-0107-notreal",',
      '\tConnection = OleDb.DataSource("Provider=SQLOLEDB;Data Source=sql.example;User ID=reader;Password={pbiplint-fixture-pwd-0108-notreal}")',
      "in",
      "\tConnection",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders API', step 'Header': the X-API-Key header in Web.Contents holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Field': the access_token field of the Query record in Web.Contents holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'FeedHeaders': the Ocp-Apim-Subscription-Key header in OData.Feed holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'FeedOptions': the x-functions-key header in OData.Feed holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Connection': the password in OleDb.DataSource's connection string holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Address': the sig parameter of the web address holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Token': the Bearer token holds a credential written into the query (value not shown)",
    ]);
  });
  it("follows a name to the step or parameter that holds the text, and reports a parameter once however many queries read it", async () => {
    const tmdl =
      parameter("ServiceToken", "pbiplint-fixture-token-0109-notreal") +
      table(
        "Customers",
        "let",
        '\tSource = Web.Contents("https://api.example.com/v1/customers", [Headers = [#"x-api-key" = ServiceToken]])',
        "in",
        "\tSource",
      ) +
      table(
        "Orders",
        "let",
        '\tKey = "pbiplint-fixture-key-0110-notreal",',
        '\tSource = Web.Contents("https://api.example.com/v1/orders", [Headers = [Authorization = "Bearer " & Key, #"x-api-key" = ServiceToken]])',
        "in",
        "\tSource",
      );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "NamedExpression",
        objectName: "ServiceToken",
        location: { file: "inline.tmdl", line: 1, column: 27 },
        detail:
          "query 'ServiceToken': the x-api-key header in Web.Contents reads a credential written here (value not shown)",
      },
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 17, column: 12 },
        detail:
          "query 'Orders', step 'Key': the Authorization header in Web.Contents reads a credential written here (value not shown)",
      },
    ]);
  });
  it("leaves alone placeholders, short values, prose, ApiKeyName, comments, and other headers and fields", async () => {
    const tmdl = table(
      "Orders API",
      "let",
      "\t// The old key was pbiplint-fixture-key-0111-notreal.",
      '\tA = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "<your key>"]]),',
      '\tB = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "Bearer {token}"]]),',
      '\tC = Web.Contents("https://api.example.com/v1", [Headers = [#"x-api-key" = "xxxxxxxxxxxx"]]),',
      '\tD = Web.Contents("https://api.example.com/v1", [Headers = [#"x-api-key" = "YOUR_API_KEY"]]),',
      '\tE = Web.Contents("https://api.example.com/v1", [Query = [key = "Enter your key here"]]),',
      '\tF = Web.Contents("https://api.example.com/v1", [Query = [token = "short"]]),',
      '\tG = Web.Contents("https://api.example.com/v1", [ApiKeyName = "api_key"]),',
      '\tH = Web.Contents("https://api.example.com/v1", [Headers = [Accept = "application/json; charset=utf-8"], Query = [page = "pbiplint-fixture-page-0112-notreal"]]),',
      '\tI = Web.Contents("https://api.example.com/v1?api_key=&format=json"),',
      '\tJ = Odbc.DataSource("dsn=Sales;Pwd=***", [HierarchicalNavigation = true]),',
      '\tK = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "Bearer " & Text.From(Number.Random())]]),',
      '\tL = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "Bearer YOUR_ACCESS_TOKEN_HERE"]]),',
      '\tM = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "Bearer xxxxxxxxxxxxxxxxxxxxxxxx"]])',
      "in",
      "\tM",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("writes no part of a value into a detail: only the rule's words and M's own names", async () => {
    const tmdl =
      parameter("ServiceToken", "pbiplint-fixture-token-0113-notreal") +
      table(
        "Orders API",
        "let",
        '\tSource = Web.Contents("https://api.example.com/v1?api_key=pbiplint-fixture-key-0114-notreal", [Headers = [#"x-api-key" = ServiceToken]])',
        "in",
        "\tSource",
      );
    const details = (await mFindings(rule, tmdl)).map((f) => f.detail ?? "");
    expect(details).toHaveLength(2);
    for (const d of details) expect(d).not.toMatch(/fixture|notreal|0113|0114/);
  });
});

describe("HARDCODED_SERVER_NAME (v3 spec, section 9.14)", () => {
  const rule = HARDCODED_SERVER_NAME;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Maintenance");
    expect(rule.name).toBe("Server name written into the query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a query once, on its first call, with the number of calls", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tSource = Sql.Database("finance-sql.example", "Warehouse"),',
      '\tArchive = Sql.Database("finance-sql.example", "Archive"),',
      '\tOrders = Table.Combine({Source{[Schema = "dbo", Item = "Orders"]}[Data], Archive{[Schema = "dbo", Item = "Orders"]}[Data]})',
      "in",
      "\tOrders",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 6, column: 15 },
        detail:
          "query 'Sales', step 'Source': Sql.Database names its server as text (2 calls in this query); a parameter would hold it",
      },
    ]);
  });
  it("reads a server held by a step, and every connector spec 9.14 names", async () => {
    const tmdl = [
      [
        "A",
        'let Server = "finance-sql.example", Source = Sql.Database(Server, "Warehouse") in Source',
      ],
      ["B", 'Sql.Databases("finance-sql.example")'],
      ["C", 'PostgreSQL.Database("pg.example", "sales")'],
      ["D", 'MySQL.Database("mysql.example", "sales")'],
      ["E", 'Oracle.Database("oracle.example")'],
      ["F", 'Snowflake.Databases("account.example", "WAREHOUSE")'],
      ["G", 'AnalysisServices.Database("powerbi://api.example.com/v1.0/myorg/Sales", "Sales")'],
      ["H", 'AnalysisServices.Databases("as.example")'],
      ["I", 'DB2.Database("db2.example", "SALES")'],
      ["J", 'Teradata.Database("teradata.example")'],
    ]
      .map(([name, m]) => table(name!, m!))
      .join("");
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'A', step 'Source': Sql.Database names its server as text; a parameter would hold it",
      "query 'B': Sql.Databases names its server as text; a parameter would hold it",
      "query 'C': PostgreSQL.Database names its server as text; a parameter would hold it",
      "query 'D': MySQL.Database names its server as text; a parameter would hold it",
      "query 'E': Oracle.Database names its server as text; a parameter would hold it",
      "query 'F': Snowflake.Databases names its server as text; a parameter would hold it",
      "query 'G': AnalysisServices.Database names its server as text; a parameter would hold it",
      "query 'H': AnalysisServices.Databases names its server as text; a parameter would hold it",
      "query 'I': DB2.Database names its server as text; a parameter would hold it",
      "query 'J': Teradata.Database names its server as text; a parameter would hold it",
    ]);
  });
  it("leaves alone a server from a parameter or a call, the database argument, and other connectors", async () => {
    const tmdl =
      'expression ServerName = "finance-sql.example" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
      table(
        "Sales",
        "let",
        '\tSource = Sql.Database(ServerName, "Warehouse"),',
        '\tBuilt = Sql.Database(Text.Lower(ServerName), "Warehouse"),',
        '\tHana = SapHana.Database("hana.example"),',
        '\tOdbc = Odbc.DataSource("dsn=Sales")',
        "in",
        "\tOdbc",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("never prints the server's name", async () => {
    const tmdl = table("Sales", 'Sql.Database("finance-sql.example", "Warehouse")');
    const [f] = await mFindings(rule, tmdl);
    expect(f?.detail).not.toContain("finance-sql");
  });
});

describe("LEGACY_EXCEL_FILE (v3 spec, section 9.17)", () => {
  const rule = LEGACY_EXCEL_FILE;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Error Prevention");
    expect(rule.name).toBe("Legacy Excel workbook");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an .xls path, on the path", async () => {
    const tmdl = table(
      "Budget",
      "let",
      '\tSource = Excel.Workbook(File.Contents("C:\\Demo\\Data\\Budget.xls"), null, true)',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Budget",
        location: { file: "inline.tmdl", line: 6, column: 44 },
        detail:
          "query 'Budget', step 'Source': the workbook is a legacy .xls file, read through the Access Database Engine",
      },
    ]);
  });
  it("reads .xlsb in any case, a path held by a step, and one in a parameter once however many queries read it", async () => {
    const tmdl =
      'expression BudgetFile = "C:\\Demo\\Data\\Budget.XLS" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
      table("A", "Excel.Workbook(File.Contents(BudgetFile), null, true)") +
      table("B", "Excel.Workbook(File.Contents(BudgetFile), null, true)") +
      table(
        "C",
        "let",
        '\tPath = "C:\\Demo\\Data\\Forecast.xlsb",',
        "\tBinary = File.Contents(Path),",
        "\tSource = Excel.Workbook(Binary, null, true)",
        "in",
        "\tSource",
      );
    expect((await mFindings(rule, tmdl)).map((f) => [f.objectName, f.detail])).toEqual([
      [
        "BudgetFile",
        "query 'BudgetFile': the workbook is a legacy .xls file, read through the Access Database Engine",
      ],
      [
        "C",
        "query 'C', step 'Path': the workbook is a legacy .xlsb file, read through the Access Database Engine",
      ],
    ]);
  });
  it("leaves alone .xlsx and .xlsm, a workbook from the web, and a path built at run time", async () => {
    const tmdl = table(
      "Budget",
      "let",
      '\tA = Excel.Workbook(File.Contents("C:\\Demo\\Data\\Budget.xlsx"), null, true),',
      '\tB = Excel.Workbook(File.Contents("C:\\Demo\\Data\\Budget.xlsm"), null, true),',
      '\tC = Excel.Workbook(Web.Contents("https://files.example.com/Budget.xls"), null, true),',
      '\tD = Excel.Workbook(File.Contents(Text.Combine({"C:\\Demo\\Data\\", "Budget.xls"})), null, true)',
      "in",
      "\tD",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});

describe("EXTENSION_FILTER_CASE (v3 spec, section 9.10)", () => {
  const rule = EXTENSION_FILTER_CASE;
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("File extension filter misses other cases");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an extension compared as written over a folder listing, on the comparison", async () => {
    const tmdl = table(
      "Sales Files",
      "let",
      '\tSource = Folder.Files("C:\\Demo\\Data\\Sales"),',
      '\t#"Filtered Rows" = Table.SelectRows(Source, each [Extension] = ".csv")',
      "in",
      '\t#"Filtered Rows"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales Files",
        location: { file: "inline.tmdl", line: 7, column: 55 },
        detail:
          "query 'Sales Files', step 'Filtered Rows': the extension test matches \".csv\" but not \".CSV\"",
      },
    ]);
  });
  it("reads <>, the text first, an upper-case extension, steps between, and every listing function", async () => {
    const tmdl = table(
      "Files",
      "let",
      '\tA = Table.SelectRows(SharePoint.Files("https://example.sharepoint.com/sites/s"), each ".XLSX" = [Extension]),',
      '\tB = Table.SelectRows(Table.RemoveColumns(Folder.Contents("C:\\Demo\\Data"), {"Attributes"}), each [Extension] <> ".tmp"),',
      '\tListed = SharePoint.Contents("https://example.sharepoint.com/sites/s"),',
      "\tKept = Listed,",
      '\tC = Table.SelectRows(Kept, each [Name] <> "x" and [Extension] = ".Json")',
      "in",
      "\tC",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Files', step 'A': the extension test matches \".XLSX\" but not \".xlsx\"",
      "query 'Files', step 'B': the extension test matches \".tmp\" but not \".TMP\"",
      "query 'Files', step 'C': the extension test matches \".Json\" but not \".json\"",
    ]);
  });
  it("leaves alone a comparison that folds case, a lowercased column, another source, and text with no letter", async () => {
    const tmdl = table(
      "Files",
      "let",
      '\tSource = Folder.Files("C:\\Demo\\Data\\Sales"),',
      '\tA = Table.SelectRows(Source, each Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0),',
      '\tB = Table.SelectRows(Source, each Text.Lower([Extension]) = ".csv"),',
      '\tLowercased = Table.TransformColumns(Source, {{"Extension", Text.Lower, type text}}),',
      '\tC = Table.SelectRows(Lowercased, each [Extension] = ".csv"),',
      '\tD = Table.SelectRows(Lakehouse.Contents(null), each [Extension] = ".csv"),',
      '\tE = Table.SelectRows(Source, each [Extension] = ".7"),',
      '\tF = Table.SelectRows(Source, each [Name] = "a.csv")',
      "in",
      "\tF",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("leaves a log file's extension alone in any case, and reports any other extension in capitals", async () => {
    const tmdl = table(
      "Gateway Logs",
      "let",
      '\tSource = Folder.Files("C:\\Demo\\Data\\Logs"),',
      '\tLower = Table.SelectRows(Source, each [Extension] = ".log"),',
      '\tUpper = Table.SelectRows(Source, each [Extension] = ".LOG"),',
      '\tMixed = Table.SelectRows(Source, each ".Log" = [Extension]),',
      '\tCsv = Table.SelectRows(Source, each [Extension] = ".CSV")',
      "in",
      "\tCsv",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Gateway Logs', step 'Csv': the extension test matches \".CSV\" but not \".csv\"",
    ]);
  });
});
