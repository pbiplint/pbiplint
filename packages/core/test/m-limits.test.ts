import { describe, expect, it } from "vitest";
import { type LintFile, lint } from "../src/engine/lint.js";

/** A table whose one M partition holds `m`, as Desktop writes a block: four tabs before each M line. */
const table = (name: string, m: string[]): LintFile => ({
  path: `definition/tables/${name}.tmdl`,
  text: `table '${name}'\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n`,
});

/** A let of these steps, each but the last followed by a comma, returning `result`. */
const letOf = (steps: string[], result: string): string[] => [
  "let",
  ...steps.map((s, i) => `\t${s}${i < steps.length - 1 ? "," : ""}`),
  "in",
  `\t${result}`,
];

const range = (n: number, f: (i: number) => string): string[] =>
  Array.from({ length: n }, (_, i) => f(i));

const parameter = (name: string): string =>
  `expression ${name} = #datetime(2020, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n`;

/** A model of four tables, each a chain of `n` steps that a rule reads from its far end. */
function chainModel(n: number): LintFile[] {
  const last = n - 1;
  return [
    { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
    {
      path: "definition/expressions.tmdl",
      text: parameter("RangeStart") + parameter("RangeEnd"),
    },
    table(
      "Sources",
      letOf(
        [
          's0 = Text.Combine({"https://", "api.example.com"})',
          ...range(n - 1, (i) => `s${i + 1} = s${i}`),
          ...range(n, (i) => `c${i} = Web.Contents(s${last})`),
        ],
        "c0",
      ),
    ),
    table(
      "Ranges",
      letOf(
        [
          't0 = #table({"Date"}, {})',
          "r0 = RangeStart",
          ...range(n - 1, (i) => `r${i + 1} = r${i}`),
          ...range(
            n,
            (i) => `f${i} = Table.SelectRows(t0, each [Date] >= r${last} and [Date] < RangeEnd)`,
          ),
        ],
        "f0",
      ),
    ),
    table(
      "Filters",
      letOf(
        [
          't0 = #table({"Date", "Id"}, {})',
          ...range(
            n,
            (i) => `g${i} = Table.SelectRows(t0, each [Date] < #date(2020, 1, 1) and [Id] = ${i})`,
          ),
        ],
        "g0",
      ),
    ),
    table(
      "Options",
      letOf(
        [
          'o0 = [Query = "select 1"]',
          ...range(n - 1, (i) => `o${i + 1} = o${i}`),
          `src = Sql.Database("sql.example.com", "Sales", o${last})`,
        ],
        "src",
      ),
    ),
  ];
}

// The resolver's guard (v3 spec, section 11.5, amended October 27, 2026). The review measured the
// first shape at 0.9 s, 6.5 s, and 46 s for 500, 1,000, and 2,000 steps. All four now lint in
// 0.54 s on Michael's Mac, most of it in the parser. The bound is three times CI's time rounded up
// to the next 5 s, CI estimated at 5.3 times Michael's Mac (Node 20, spec 11.5): 3 x 5.3 x 0.54 s
// is 8.6 s, so 10 s; to be confirmed on CI.
const BOUND_MS = 10_000;

describe("the resolver on 2,000 chained steps", () => {
  it(`lints four long chains in under ${BOUND_MS / 1000} seconds, each rule reading them`, async () => {
    const started = performance.now();
    const result = await lint(chainModel(2000), { config: { failOn: "none" } });
    const ms = performance.now() - started;
    const count = (id: string) => result.findings.filter((f) => f.ruleId === id).length;
    expect(result.summary.ruleErrors).toEqual([]);
    expect(count("PARSE_ISSUE")).toBe(0);
    expect(count("DYNAMIC_DATA_SOURCE")).toBe(2000);
    expect(count("FIXED_DATE_IN_ROW_FILTER")).toBe(2000);
    expect(count("MINIMIZE_POWER_QUERY_TRANSFORMATIONS")).toBe(1);
    expect(count("INCREMENTAL_REFRESH_RANGE_BOUNDS")).toBe(0);
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
});
