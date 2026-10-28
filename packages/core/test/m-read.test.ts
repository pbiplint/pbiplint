import { describe, expect, it } from "vitest";
import { lint, type LintFile } from "../src/engine/lint.js";
import { readM } from "../src/m/read.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { fixturesDir, readModelFiles } from "./helpers.js";

const read = (files: LintFile[]) =>
  readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
const file = (text: string): LintFile => ({ path: "definition/tables/Sales.tmdl", text });
/** A made-up value in the fixtures' form (v3 spec, section 11.3). */
const fake = (kind: string, n: string): string => `pbiplint-fixture-${kind}-${n}-notreal`;

describe("readM", () => {
  it("reads m-zoo's 38 M expressions: 27 partitions, Sales's policy is not read again, 10 shared expressions", async () => {
    const m = await read(readModelFiles(`${fixturesDir}m-zoo.SemanticModel`));
    expect(m.issues).toEqual([]);
    expect(m.queries.filter((q) => q.kind === "partition")).toHaveLength(27);
    expect(m.queries.filter((q) => q.kind === "refreshPolicy")).toHaveLength(0);
    expect(m.queries.filter((q) => q.kind === "expression").map((q) => q.name)).toEqual([
      "RangeStart",
      "RangeEnd",
      "ServerName",
      "ApiBase",
      "Environment",
      "DataFolder",
      "ExportFolder",
      "ServiceToken",
      "DateKey",
      "GetPage",
    ]);
    expect(m.queries.every((q) => q.ast !== undefined)).toBe(true);
  });
  it("names a partition's query after its table, and reads ServerName from its expression = line", async () => {
    const m = await read(readModelFiles(`${fixturesDir}m-zoo.SemanticModel`));
    const sales = m.queries.find((q) => q.kind === "partition" && q.name === "Sales")!;
    expect(sales.owner).toMatchObject({ name: "Sales" });
    const server = m.queries.find((q) => q.name === "ServerName")!;
    expect(server.text).toMatch(/^"finance-sql\.example" meta/);
  });
  it("reads a refresh policy whose M differs from its table's partitions", async () => {
    const m = await read([
      file(
        "table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n\n\trefreshPolicy\n\t\tpolicyType: basic\n\t\tsourceExpression = 2\n",
      ),
    ]);
    expect(m.queries.map((q) => [q.kind, q.name, q.text])).toEqual([
      ["partition", "Sales", "1"],
      ["refreshPolicy", "Sales", "2"],
    ]);
  });
  it("skips empty M without an issue", async () => {
    const m = await read([
      { path: "definition/expressions.tmdl", text: "expression Empty\n\tlineageTag: x\n" },
    ]);
    expect(m.queries).toEqual([]);
    expect(m.issues).toEqual([]);
  });
  it("locates a token in inline, block, and fenced M, with tabs and with spaces", async () => {
    const text = [
      "table Sales", //                                              1
      "\tpartition Sales = m", //                                    2
      "\t\tmode: import", //                                         3
      "\t\tsource = Web.Contents(Url)", //                           4 inline
      "",
      "table Block",
      "\tpartition Block = m",
      "\t\tsource =",
      "\t\t\t\tlet", //                                              9
      "\t\t\t\t    Source = Web.Contents(Url)", //                   10 block
      "\t\t\t\tin",
      "\t\t\t\t    Source",
      "",
      "table Fenced",
      "\tpartition Fenced = m",
      "\t\tsource = ```", //                                         16
      "\t\t\tlet", //                                                17
      "\t\t\t    Source = Web.Contents(Url)", //                     18 fence
      "\t\t\tin",
      "\t\t\t    Source",
      "\t\t\t```",
      "",
    ].join("\n");
    const m = await read([file(text)]);
    const [inline, block, fenced] = m.queries;
    // `Web.Contents` starts at code unit 0 of the inline M, 13 of the block's M line 1, 13 of the fence's.
    expect(m.locate(inline!, { lineNumber: 0, lineCodeUnit: 0 })).toEqual({
      file: "definition/tables/Sales.tmdl",
      line: 4,
      column: 12,
    });
    expect(m.locate(block!, { lineNumber: 1, lineCodeUnit: 13 })).toEqual({
      file: "definition/tables/Sales.tmdl",
      line: 10,
      column: 18,
    });
    expect(m.locate(fenced!, { lineNumber: 1, lineCodeUnit: 13 })).toEqual({
      file: "definition/tables/Sales.tmdl",
      line: 18,
      column: 17,
    });
  });
  it("locates a token in M indented with spaces under a tab-indented header, and in a CRLF file", async () => {
    const lines = [
      "table Sales",
      "\tpartition Sales = m",
      "\t\tsource =",
      "        let",
      "            Source = 1",
      "        in",
      "            Source",
      "",
    ];
    const m = await read([file(lines.join("\r\n"))]);
    // TMDL refuses space indentation at declaration depth, but M lines are the value's own text.
    expect(m.locate(m.queries[0]!, { lineNumber: 1, lineCodeUnit: 4 })).toEqual({
      file: "definition/tables/Sales.tmdl",
      line: 5,
      column: 13,
    });
  });
  it("records M that does not parse as an issue at its TMDL line and column, cut to 120 characters", async () => {
    const long = `${"x".repeat(202)} 2`;
    const m = await read([
      file(
        `table Sales\n\tpartition Sales = m\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t    a = 1,\n\t\t\t\t    b = \n\t\t\t\tin\n\t\t\t\t    a\n\ntable Long\n\tpartition Long = m\n\t\tsource = ${long}\n`,
      ),
    ]);
    expect(m.issues).toEqual([
      {
        file: "definition/tables/Sales.tmdl",
        line: 7,
        column: 5,
        text: "in",
        reason: expect.stringMatching(
          /^M could not be parsed: Expected to find one of the following/,
        ),
      },
      {
        file: "definition/tables/Sales.tmdl",
        line: 12,
        column: 215,
        text: `source = ${long}`.slice(0, 120),
        reason: "M could not be parsed: Finished parsing but more tokens remain",
      },
    ]);
    expect(m.queries.find((q) => q.name === "Sales")!.ast).toBeUndefined();
  });
  it("hides the text literals of the line it quotes, before the cut, and one opened on a line above", async () => {
    const key = ["pbiplint", "fixture", "key", "0110", "notreal"].join("-");
    const m = await read([
      file(
        `table Sales\n\tpartition Sales = m\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t    a = "${"x".repeat(100)}", k = "${key}" 2\n\t\t\t\tin\n\t\t\t\t    a\n\ntable Open\n\tpartition Open = m\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t    a = "one\n\t\t\t\t${key}", b = 1 2\n\t\t\t\tin\n\t\t\t\t    a\n`,
      ),
    ]);
    // Masked before the cut: the first line is 150 characters as written, and reads whole once
    // masked. The second continues a literal opened on the line above.
    expect(m.issues.map((i) => i.text)).toEqual(['a = "…", k = "…" 2', '…", b = 1 2']);
  });
  it("locates M after a text literal holding U+2028 or U+2029 on the TMDL line a person counts", async () => {
    const text = [
      "table Sales", //                                              1
      "\tpartition Sales = m", //                                    2
      "\t\tsource =", //                                             3
      '\t\t\t\tlet a = "x\u2028y\u2029z",', //                       4, M line 0
      "\t\t\t\t    b =", //                                          5, M line 1
      "\t\t\t\tin", //                                               6, M line 2
      "\t\t\t\t    a", //                                            7
      "",
    ].join("\n");
    const m = await read([file(text)]);
    // The parser breaks lines at \n, U+2028, and U+2029, so its lines are 0 `let a = "x`, 1 `y`,
    // 2 `z",`, 3 `    b =`, 4 `in`, 5 `    a`. TMDL breaks only at \n, so M has four lines there.
    // The error is at `in`, parser line 4 code unit 0: M line 2, TMDL line 4 + 2 = 6, after four
    // tabs, so column 5 (not TMDL line 4 + 4 = 8).
    expect(m.issues.map((i) => [i.line, i.column, i.text])).toEqual([[6, 5, "in"]]);
    const q = m.queries[0]!;
    // `z` is parser line 2 code unit 0. On M line 0, `let a = "x` is code units 0 to 9, U+2028 is
    // 10, `y` 11, U+2029 12, so `z` is code unit 13: TMDL line 4, after four tabs, column
    // 4 + 13 + 1 = 18.
    expect(m.locate(q, { lineNumber: 2, lineCodeUnit: 0 })).toEqual({
      file: "definition/tables/Sales.tmdl",
      line: 4,
      column: 18,
    });
    // `b` is parser line 3 code unit 4: M line 1 code unit 4, TMDL line 5, column 4 + 4 + 1 = 9.
    expect(m.locate(q, { lineNumber: 3, lineCodeUnit: 4 })).toEqual({
      file: "definition/tables/Sales.tmdl",
      line: 5,
      column: 9,
    });
  });
});

describe("MIndex.maskedLine (v3 spec, section 7, amended October 27, 2026)", () => {
  it("hides each line of a multi-line literal, by the whole file and by the line alone", async () => {
    const text = [
      "table T",
      '    measure Q = "SELECT 1',
      `    FROM x WHERE k = '${fake("pwd", "0203")}'`,
      '    AND y = ""say ""hi""',
      '    "',
    ].join("\n");
    const m = await read([{ path: "definition/tables/T.tmdl", text }]);
    const lines = text.split("\n");
    expect(
      [2, 3, 4, 5].map((n) => m.maskedLine("definition/tables/T.tmdl", n, lines[n - 1]!).trim()),
    ).toEqual(['measure Q = "…', "…", "…", '…"']);
  });
  it("masks a line by itself when the text is not the file's line", async () => {
    const m = await read([file("table Sales\n")]);
    expect(m.maskedLine("definition/tables/Sales.tmdl", 1, 'x = "a"')).toBe('x = "…"');
  });
});

describe("lint and the M index", () => {
  it("never throws on M that does not parse", async () => {
    await expect(
      lint([file("table Sales\n\tpartition Sales = m\n\t\tsource = let in\n")]),
    ).resolves.toBeDefined();
  });
});
