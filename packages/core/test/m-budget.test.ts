import { describe, expect, it, vi } from "vitest";
import type { LintFile } from "../src/engine/lint.js";
import { mWork, type MBudget } from "../src/m/budget.js";
import { maskLiterals } from "../src/m/mask.js";
import { readM } from "../src/m/read.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";

// These tests read inputs of millions of characters. On CI a few take several seconds, past
// Vitest's 5 s default, so each test here has a minute; the bounds the tests assert are their own.
vi.setConfig({ testTimeout: 60_000 });

/** What one unmatched ( costs per token read up to it, as budget.ts weighs it. */
const WEIGHT = 6;

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
/** n short lists, each on its own line of a partition's source, inside an open {, then d open (. */
const openAfterLists = (d: number, n: number) =>
  `\n\t\t\t{${Array<string>(n).fill("{1,1,1}").join(",\n\t\t\t")},\n\t\t\t${"(".repeat(d)}`;
/** n items in short lists on their own lines of a partition's source, closed. */
const rows = (item: string, n: number) => {
  const list = `{${Array<string>(50).fill(item).join(",")}}`;
  const groups = Array<string>(30).fill(list).join(",\n\t\t\t");
  return `{${Array<string>(Math.ceil(n / 1_500))
    .fill(`{${groups}}`)
    .join(",\n\t\t\t")}}`;
};
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
  it.each([
    // M's lexer splits these at @, at each .. or ..., and after each number a word starts with.
    ["and@a", 7],
    ["1 and@a", 9],
    ["1..2", 7],
    ["1...", 5],
    ["1and 1", 7],
    ["1e5or 1", 7],
    ["0x1Fand 1", 8],
    ["@a@a", 9],
    [".1.2", 5],
    ["1.2.5", 5],
    ["1e5.1e5.1e5", 8],
    [".....", 5],
    // A name is one token, however many dots it holds, even with a word M reads as an operator.
    ["Table.AddColumn", 4],
    ["a.and.b", 3],
    ["1.5", 3],
  ])("counts the tokens in a word as M's lexer does: %j is %i units", (text, units) => {
    expect(mWork(text).units).toBe(units);
  });
  it("charges an operator in a word to its chain", () => {
    const chain = (op: string) => `1${op.repeat(8_000)}`;
    expect(mWork(chain(" and@a\n")).units).toBe(mWork(chain(" and @a\n")).units - 1_000);
  });
  it.each([
    ["names joined by dots", `${"a.".repeat(8_000_000)}a`, 2_000_003],
    ["one name", "a".repeat(16_000_000), 2_000_003],
    ["a number", "1".repeat(16_000_000), 2_000_003],
    ["dots", ".".repeat(16_000_000), 1_748_778_214],
    ["numbers", ".1".repeat(8_000_000), 3_924_250_001],
    ["@ signs", "@".repeat(16_000_000), 15_659_000_001],
    ["names split by ..", "a..".repeat(5_333_333), 6_967_776_908],
  ])("reads a word of 16 MB of %s", (_shape, text, units) => {
    expect(mWork(text).units).toBe(units);
  });
  it.each([
    // Each ( left unmatched costs WEIGHT per token read up to and including it.
    ["(1", 5 + WEIGHT, 1],
    ["((", 5 + 3 * WEIGHT, 2],
    ["{1,(", 9 + 4 * WEIGHT, 2],
    // Parentheses match only among themselves: another bracket closes none.
    ["(}", 5 + WEIGHT, 1],
    [")(", 5 + 2 * WEIGHT, 1],
    // Matched, whatever sits between, and in text or a comment: no charge.
    ["(1)", 7, 1],
    ["({)", 7, 2],
    ["f(g(1))", 15, 2],
    ['"("', 3, 0],
    ["1 // (", 3, 0],
    // An open { or [ is not charged.
    ["{1,{", 9, 2],
    ["[a=[", 9, 2],
  ])("charges each unmatched ( by the tokens read so far: %j is %i units", (text, units, depth) => {
    expect(mWork(text)).toEqual({ units, depth });
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
  it.each([
    [127, 2_000],
    [127, 9_000],
    [32, 36_000],
    [8, 36_000],
  ])(
    "reports %i unmatched ( after %i lists as too large, unparsed, within 5 seconds",
    async (d, n) => {
      const text = openAfterLists(d, n);
      const started = performance.now();
      const m = await readPartition(text);
      expect(performance.now() - started).toBeLessThan(5_000);
      expect(m.queries[0]!.ast).toBeUndefined();
      expect(m.issues.map((i) => i.reason)).toEqual([
        "M is too large or complex to read (over pbiplint's limit for one query)",
      ]);
    },
  );
  it.each([
    ["1 and@a", `1${" and@a\n\t\t\t".repeat(30_000)}`],
    ["1 or@a", `1${" or@a\n\t\t\t".repeat(30_000)}`],
    ["1..not@a", rows("1..not@a", 200_000)],
    ["1..2", rows("1..2", 300_000)],
    ["@a@a", rows("@a@a", 300_000)],
    [".1.1", ".1".repeat(500_000)],
    ["...", ".".repeat(1_500_000)],
  ])(
    "reports M with its tokens in one word, %s, as too large, unparsed, within 5 seconds",
    async (_shape, text) => {
      const started = performance.now();
      const m = await readPartition(`\n\t\t\t${text}`);
      expect(performance.now() - started).toBeLessThan(5_000);
      expect(m.queries[0]!.ast).toBeUndefined();
      expect(m.issues.map((i) => i.reason)).toEqual([
        "M is too large or complex to read (over pbiplint's limit for one query)",
      ]);
    },
  );
  it("counts an unmatched ( toward the model's budget, so a valid query after it can go over", async () => {
    const broken = mWork("(1").units;
    const valid = mWork("{1, 2, 3}").units;
    const m = await readExpressions(
      ["expression A = (1", "expression Z = {1, 2, 3}"].join("\n\n"),
      {
        query: 1_000,
        model: broken + valid - 1,
        depth: 128,
      },
    );
    expect(mWork("(1)").units + valid).toBeLessThan(broken + valid - 1);
    expect(m.queries.map((q) => [q.name, q.ast !== undefined])).toEqual([
      ["A", false],
      ["Z", false],
    ]);
    expect(m.issues[1]!.reason).toBe(
      "M is too large or complex to read (over pbiplint's limit for one model's M)",
    );
  });
  it("still parses a small query with an unmatched (, and reports the parser's own message", async () => {
    const m = await readPartition(openAfterLists(8, 100));
    expect(m.issues).toHaveLength(1);
    expect(m.issues[0]!.reason).not.toContain("too large");
  });
  it("gives a query whose every ( is matched no charge, whatever the nesting", () => {
    const lists = Array<string>(2_000).fill("{1,1,1}").join(",\n");
    const closed = `{${lists},\n${"(".repeat(127)}1${")".repeat(127)}}`;
    expect(mWork(closed).units).toBe(40_722);
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
