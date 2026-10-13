import { describe, expect, it } from "vitest";
import { lint, type LintFile } from "../src/engine/lint.js";
import { readM } from "../src/m/read.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { fixturesDir, readModelFiles } from "./helpers.js";

const read = (files: LintFile[]) =>
  readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
const file = (text: string): LintFile => ({ path: "definition/tables/Sales.tmdl", text });

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
    const long = `"${"x".repeat(200)}" 2`;
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
});

describe("lint and the M index", () => {
  it("never throws on M that does not parse", async () => {
    await expect(
      lint([file("table Sales\n\tpartition Sales = m\n\t\tsource = let in\n")]),
    ).resolves.toBeDefined();
  });
});
