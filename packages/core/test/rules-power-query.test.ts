import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY } from "../src/rules/pbiplint/power-query.js";
import type { Rule } from "../src/rules/types.js";
import { mFindings, mObjectNames } from "./helpers.js";

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
