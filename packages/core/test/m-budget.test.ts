import { describe, expect, it } from "vitest";
import type { LintFile } from "../src/engine/lint.js";
import { mWork, type MBudget } from "../src/m/budget.js";
import { maskLiterals } from "../src/m/mask.js";
import { readM } from "../src/m/read.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";

const read = (files: LintFile[], budget?: MBudget) =>
  readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files, budget);
/** One partition whose source is `m`, on line 4 of `definition/tables/T.tmdl`. */
const readPartition = (m: string, budget?: MBudget) =>
  read(
    [
      {
        path: "definition/tables/T.tmdl",
        text: `table T\n\tpartition T = m\n\t\tmode: import\n\t\tsource = ${m}\n`,
      },
    ],
    budget,
  );
const readExpressions = (tmdl: string, budget?: MBudget) =>
  read([{ path: "definition/expressions.tmdl", text: tmdl }], budget);

describe("mWork (v3 spec, section 7, amended October 27, 2026)", () => {
  it.each([
    ["1+1", 7, 0],
    ["{1, 2, 3}", 16, 1],
    ['let\n  a = "x, y",\n  b = a & "z"\nin\n  b', 33, 0],
    ["// a, b\n(1)", 9, 1],
    ["f(g(h(1)))", 22, 3],
  ])("counts %j as %i units, nested %i deep", (text, units, depth) => {
    expect(mWork(text)).toEqual({ units, depth });
  });
  it("charges an operator chain by the square of its length", () => {
    expect(mWork(Array(80_000).fill("1").join("+")).units).toBe(26_901_853);
  });
  it("charges a list by the square of its items", () => {
    const list = `{${Array.from({ length: 5000 }, (_, i) => i).join(", ")}}`;
    expect(mWork(list).units).toBe(54_122);
  });
  it("reads a comment as M's lexer does, ending a line comment at U+2028", () => {
    expect(mWork("1 // c\u2028+ 2")).toEqual({ units: 9, depth: 0 });
  });
});

describe("readM's budget (v3 spec, section 7, amended October 27, 2026)", () => {
  it("reports a chain of 80,000 terms as M too large or complex to read, at its first line, unparsed, within 5 seconds", async () => {
    const started = performance.now();
    const m = await readPartition(Array(80_000).fill("1").join("+"));
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(m.queries[0]!.ast).toBeUndefined();
    expect(m.issues).toEqual([
      expect.objectContaining({
        file: "definition/tables/T.tmdl",
        line: 4,
        column: 12,
        reason: "M is too large or complex to read (over pbiplint's limit for one query)",
      }),
    ]);
    expect(m.issues[0]!.text.startsWith("source = 1+1+1")).toBe(true);
    expect(m.issues[0]!.text).toHaveLength(120);
  });
  it("reads M nested 128 brackets deep and reports M nested 129 deep", async () => {
    const nested = (n: number) => `${"(".repeat(n)}1${")".repeat(n)}`;
    expect((await readPartition(nested(128))).issues).toEqual([]);
    expect((await readPartition(nested(129))).issues.map((i) => i.reason)).toEqual([
      "M is too large or complex to read (over pbiplint's limit for one query)",
    ]);
  });
  it("reads a query of exactly the query budget and reports one a unit over", async () => {
    const u = mWork("{1, 2, 3}").units;
    expect((await readPartition("{1, 2, 3}", { query: u, model: u, depth: 128 })).issues).toEqual(
      [],
    );
    expect(
      (await readPartition("{1, 2, 3}", { query: u - 1, model: u, depth: 128 })).issues,
    ).toHaveLength(1);
  });
  it("stops a model's M at the model's budget, and a query over its own budget uses none of it", async () => {
    const u = mWork("{1, 2, 3}").units;
    const m = await readExpressions(
      [
        "expression A = {1, 2, 3}",
        "expression B = {1, 2, 3}",
        "expression D = {1, 2, 3, 4, 5, 6, 7, 8, 9}",
        "expression C = {1, 2, 3}",
      ].join("\n\n"),
      { query: 2 * u, model: 2 * u, depth: 128 },
    );
    expect(m.queries.map((q) => [q.name, q.ast !== undefined])).toEqual([
      ["A", true],
      ["B", true],
      ["D", false],
      ["C", false],
    ]);
    expect(m.issues.map((i) => i.reason)).toEqual([
      "M is too large or complex to read (over pbiplint's limit for one query)",
      "M is too large or complex to read (over pbiplint's limit for one model's M)",
    ]);
  });
});

// The review's fix round 1: a text literal of millions of characters overflowed the regex stack.
describe("long text literals, scanned without a regex", () => {
  const SIXTEEN_MB = 16_000_000;
  const TOO_LARGE = "M is too large or complex to read (over pbiplint's limit for one query)";
  it.each([
    ["a 16 MB literal", `"${"a".repeat(SIXTEEN_MB)}"`, '"…"'],
    ["an unclosed 16 MB literal", `"${"a,".repeat(SIXTEEN_MB / 2)}`, '"…'],
    ["16 MB of doubled quotes", `"${'""'.repeat(SIXTEEN_MB / 2)}"`, '"…"'],
  ])("reads %s with mWork, readM, and maskLiterals", async (_shape, m, masked) => {
    expect(mWork(m)).toEqual({ units: 3 + Math.floor(m.length / 8), depth: 0 });
    expect(maskLiterals(m)).toBe(masked);
    const read = await readPartition(m);
    expect(read.issues).toEqual([
      expect.objectContaining({
        line: 4,
        column: 12,
        text: `source = ${masked}`,
        reason: TOO_LARGE,
      }),
    ]);
  });
  it("keeps a 16 MB quoted name, and a 16 MB TMDL name of doubled apostrophes", () => {
    const name = `#"${'""'.repeat(SIXTEEN_MB / 2)}" = 1`;
    expect(maskLiterals(name)).toBe(name);
    const tmdl = `measure '${"''".repeat(SIXTEEN_MB / 2)}' = "x"`;
    expect(maskLiterals(tmdl, { tmdl: true })).toBe(`${tmdl.slice(0, -3)}"…"`);
    const open = `measure '${"''".repeat(SIXTEEN_MB / 2)} = "x"`;
    expect(maskLiterals(open, { tmdl: true })).toBe(`${open.slice(0, -3)}"…"`);
  });
});
