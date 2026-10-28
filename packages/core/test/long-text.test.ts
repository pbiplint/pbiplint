import { describe, expect, it, vi } from "vitest";
import { lint } from "../src/engine/lint.js";
import { formatMarkdown } from "../src/format/markdown.js";
import { splitQualifiedName } from "../src/model/build.js";
import { pairingDecision } from "../src/project/route.js";
import * as rules from "../src/rules/microsoft-bpa/measures.js";
import * as tableRules from "../src/rules/microsoft-bpa/tables.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { objectNames } from "./helpers.js";

// These tests read inputs of millions of characters. On CI a few take several seconds, past
// Vitest's 5 s default, so each test here has a minute; the bounds the tests assert are their own.
vi.setConfig({ testTimeout: 60_000 });

// The review's fix round 2 (October 27, 2026): a regex whose quantified group holds an alternation
// overflowed the stack on millions of characters, and one whose parts overlap backtracked by the
// square or cube of a run. Each is held here to long text, read whole and quickly.
const SIXTEEN_MB = 16_000_000;
const LONG = 200_000;

const within = <T>(ms: number, f: () => T): T => {
  const started = performance.now();
  const out = f();
  expect(performance.now() - started).toBeLessThan(ms);
  return out;
};

describe("long TMDL names", () => {
  it.each([
    ["table", (n: string) => `table '${n}'\n\tpartition P = m\n\t\tmode: import\n\t\tsource = 1\n`],
    [
      "partition",
      (n: string) => `table T\n\tpartition '${n}' = m\n\t\tmode: import\n\t\tsource = 1\n`,
    ],
  ])(
    "lints a 16 MB %s name without throwing",
    async (kind, tmdl) => {
      const name = "a".repeat(SIXTEEN_MB);
      const result = await lint([{ path: "definition/tables/T.tmdl", text: tmdl(name) }], {
        config: { failOn: "none" },
      });
      expect(result.summary.ruleErrors).toEqual([]);
      expect(result.findings.some((f) => f.ruleId === "PARSE_ISSUE")).toBe(false);
      const table = parseTmdl("t.tmdl", tmdl(name)).roots[0]!;
      const node = kind === "table" ? table : table.children[0]!;
      expect(node.name).toHaveLength(SIXTEEN_MB);
    },
    60_000,
  );
  it("reads a 16 MB name of doubled quotes, and one left open, as before", () => {
    const pairs = "''".repeat(SIXTEEN_MB / 2);
    const closed = parseTmdl("t.tmdl", `table '${pairs}'\n`).roots[0]!;
    expect(closed.name).toHaveLength(SIXTEEN_MB / 2);
    expect(parseTmdl("t.tmdl", `table '${pairs}'\n`).issues).toEqual([]);
    expect(parseTmdl("t.tmdl", `table '${pairs}\n`).issues).toHaveLength(1);
  });
  it("splits a qualified name with a 16 MB table name", () => {
    const name = "a".repeat(SIXTEEN_MB);
    expect(splitQualifiedName(`'${name}'.'Amount'`)).toEqual({ table: name, column: "Amount" });
    expect(splitQualifiedName(`'${"''".repeat(SIXTEEN_MB / 2)}'.x`).table).toHaveLength(
      SIXTEEN_MB / 2,
    );
    expect(splitQualifiedName(`'${name}`)).toEqual({ table: "", column: `'${name}` });
  });
});

describe("long runs a regex once backtracked over", () => {
  it("reads a declaration line with a long run of spaces before a line separator", () => {
    const spaces = " ".repeat(LONG);
    within(1_000, () => parseTmdl("t.tmdl", `table T\n\tmeasure${spaces}x\u2028y = 1\n`));
    within(1_000, () => parseTmdl("t.tmdl", `table T\n\tref table${spaces}x\u2028\n`));
  });
  it("finds no folder name in a long run of slashes", () => {
    const path = `${"/".repeat(LONG)}x`;
    within(1_000, () => pairingDecision({ kind: "byPath", path }, "x", "x.Report"));
  });
  it("writes a word that ends in a long run of punctuation", async () => {
    const result = await lint([{ path: "definition/model.tmdl", text: "model Model\n" }]);
    const message = `see #1${".".repeat(LONG)}x`;
    const md = within(1_000, () =>
      formatMarkdown({ ...result, diagnostics: [{ kind: "unread-file", message }] }),
    );
    expect(md).toContain("> Notice: see `#1...");
  });
  it.each([
    ["FILTER_COLUMN_VALUES", "CALCULATE(x, FILTER("],
    ["FILTER_COLUMN_VALUES", "CALCULATE(x, FILTER(a"],
    ["FILTER_COLUMN_VALUES", "CALCULATETABLE(x, FILTER(T,"],
    ["FILTER_MEASURE_VALUES_BY_COLUMNS", "CALCULATE(x, FILTER("],
    ["AVOID_USING_1_X_Y_SYNTAX", "1 - SUM("],
    ["AVOID_USING_1_X_Y_SYNTAX", "1 -"],
  ] as const)("%s reads %j and a long run of spaces quickly", (rule, head) => {
    const tmdl = `table T\n\tmeasure A = ${head}${" ".repeat(LONG)};\n`;
    expect(within(1_000, () => objectNames(rules[rule], tmdl))).toEqual([]);
  });
  it("AVOID_USING_1_X_Y_SYNTAX reads a long run of digits quickly", () => {
    const tmdl = `table T\n\tmeasure A = ${"1".repeat(LONG)}\n`;
    expect(within(1_000, () => objectNames(rules.AVOID_USING_1_X_Y_SYNTAX, tmdl))).toEqual([]);
  });
});

// The DAX scans (October 27, 2026): a search for `CALCULATE\s*\([^,]+,` or `USERELATIONSHIP\s*\(\s*.+?\]`
// started again at every function name and read on to the same comma or bracket each time, so
// these shapes took 13 to 47 seconds. A matcher written by hand reads each one once. The bound is
// three times the slowest CI run.
const MEGABYTE = 1_000_000;
const BOUND_MS = 10_000;
const measure = (dax: string) => `table T\n\tmeasure A = ${dax}\n`;
const rls = "role R\n\tmodelPermission: read\n\ttablePermission T = TRUE()\n";
const run = (piece: string, size: number) => piece.repeat(Math.ceil(size / piece.length));

describe("DAX scans that restarted at every function name", () => {
  it.each([
    ["FILTER_COLUMN_VALUES", "CALCULATE(", "x, FILTER(T, T[a])"],
    ["FILTER_COLUMN_VALUES", "CALCULATETABLE(", "x, FILTER(T, T[a])"],
    ["FILTER_MEASURE_VALUES_BY_COLUMNS", "CALCULATE(", "x, FILTER(T, [a])"],
    ["FILTER_MEASURE_VALUES_BY_COLUMNS", "CALCULATETABLE(", "x, FILTER(T, [a])"],
    ["FILTER_MEASURE_VALUES_BY_COLUMNS", "CALCULATE(x, FILTER(T, [", "a]"],
  ] as const)("%s reads 1 MB of %j quickly, and finds a match at its end", (rule, piece, end) => {
    const dax = run(piece, MEGABYTE);
    expect(within(BOUND_MS, () => objectNames(rules[rule], measure(dax)))).toEqual([]);
    expect(within(BOUND_MS, () => objectNames(rules[rule], measure(dax + end)))).toEqual(["[A]"]);
  });
  it("AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE reads 900 KB of USERELATIONSHIP(a] quickly", () => {
    const rule = tableRules.AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE;
    const dax = run("USERELATIONSHIP(a]", 0.9 * MEGABYTE);
    expect(within(BOUND_MS, () => objectNames(rule, measure(dax) + rls))).toEqual([]);
    expect(within(BOUND_MS, () => objectNames(rule, measure(`${dax}, T[`) + rls))).toEqual(["'T'"]);
  });
  it(
    "reads each shape at 16 MB quickly",
    () => {
      const shapes = [
        [rules.FILTER_COLUMN_VALUES, "CALCULATE("],
        [rules.FILTER_COLUMN_VALUES, "CALCULATETABLE("],
        [rules.FILTER_MEASURE_VALUES_BY_COLUMNS, "CALCULATE(x, FILTER(T, ["],
        [
          tableRules.AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE,
          "USERELATIONSHIP(a]",
        ],
      ] as const;
      for (const [rule, piece] of shapes) {
        const tmdl = measure(run(piece, SIXTEEN_MB)) + rls;
        expect(within(BOUND_MS, () => objectNames(rule, tmdl))).toEqual([]);
      }
      // Four shapes, each held to its own bound, so the test's own timeout sits above all four.
    },
    4 * BOUND_MS + 20_000,
  );
});
