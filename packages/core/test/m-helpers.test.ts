import { describe, expect, it } from "vitest";
import { textLiterals } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { msg } from "../src/messages/format.js";
import { mFinding, queryLabel, queryLabelText } from "../src/rules/m-helpers.js";
import { modelFrom } from "./helpers.js";

/** The M index of inline TMDL, read as `lint` reads it. */
const indexOf = async (tmdl: string) =>
  readM(modelFrom(tmdl), [{ path: "inline.tmdl", text: tmdl }]);

/** A table whose one M partition holds `m`, as Desktop writes a block: four tabs before each M line. */
const table = (name: string, ...m: string[]): string =>
  `table '${name}'\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n`;

/** mFinding on a query's first text literal, without the object it carries for ignores. */
async function onFirstLiteral(tmdl: string, query = 0) {
  const m = await indexOf(tmdl);
  const q = m.queries[query]!;
  const { object: _object, ...f } = mFinding(m, q, textLiterals(q)[0]!.node, "found");
  return f;
}

describe("mFinding (v3 spec, section 6.3)", () => {
  it("names a partition's query after its table, then the step, at the literal's line and column", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tSource = Csv.Document(File.Contents("C:\\Demo\\Data\\Sales.csv"))',
      "in",
      "\tSource",
    );
    expect(await onFirstLiteral(tmdl)).toEqual({
      objectType: "Partition",
      objectName: "Sales",
      location: { file: "inline.tmdl", line: 6, column: 42 },
      detail: "query 'Sales', step 'Source': found",
    });
  });
  it("names a shared expression's query after the expression, with no step outside a let", async () => {
    const tmdl =
      'expression ExportFolder = "d:/Exports/" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n';
    expect(await onFirstLiteral(tmdl)).toEqual({
      objectType: "NamedExpression",
      objectName: "ExportFolder",
      location: { file: "inline.tmdl", line: 1, column: 27 },
      detail: "query 'ExportFolder': found",
    });
  });
  it("adds the partition's name when the table has more than one M partition", async () => {
    const tmdl =
      "table Sales\n" +
      "\tpartition 'Sales 2024' = m\n\t\tmode: import\n\t\tsource = File.Contents(\"C:\\Demo\\Data\\2024.csv\")\n" +
      "\tpartition 'Sales 2025' = m\n\t\tmode: import\n\t\tsource = File.Contents(\"C:\\Demo\\Data\\2025.csv\")\n";
    expect(await onFirstLiteral(tmdl)).toEqual({
      objectType: "Partition",
      objectName: "Sales 2024",
      location: { file: "inline.tmdl", line: 4, column: 26 },
      detail: "query 'Sales', partition 'Sales 2024': found",
    });
  });
  it("puts a refresh policy's finding on its table", async () => {
    const tmdl =
      'table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = Sql.Database("db.example", "Warehouse")\n\n' +
      '\trefreshPolicy\n\t\tpolicyType: basic\n\t\tsourceExpression = File.Contents("C:\\Demo\\Data\\Sales.csv")\n';
    // The policy's query differs from its partition's, so it is read (v3 spec, section 5.1).
    expect(await onFirstLiteral(tmdl, 1)).toEqual({
      objectType: "Table",
      objectName: "'Sales'",
      location: { file: "inline.tmdl", line: 8, column: 36 },
      detail: "query 'Sales': found",
    });
  });
  it("quotes names as pbiplint quotes a table's", async () => {
    // TMDL doubles the quote in a quoted name; M's #"..." keeps it single.
    const tmdl =
      "table 'Bob''s Sales'\n\tpartition 'Bob''s Sales' = m\n\t\tmode: import\n\t\tsource =\n" +
      '\t\t\t\tlet\n\t\t\t\t\t#"Bob\'s Step" = "x"\n\t\t\t\tin\n\t\t\t\t\t#"Bob\'s Step"\n\n';
    const m = await indexOf(tmdl);
    expect(queryLabel(m.queries[0]!)).toEqual(msg("query.name", { query: "'Bob''s Sales'" }));
    expect(queryLabelText(m.queries[0]!)).toBe("query 'Bob''s Sales'");
    expect((await onFirstLiteral(tmdl)).detail).toBe(
      "query 'Bob''s Sales', step 'Bob''s Step': found",
    );
  });
});
