import { describe, expect, it } from "vitest";
import { type LintFile, lint } from "../src/engine/lint.js";
import { calls } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { origin } from "../src/m/resolve.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";

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

/** The origin of the address of the one `Web.Contents` call in a partition of these M lines. */
async function addressOrigin(m: string[]): Promise<string> {
  const files = [table("T", m)];
  const index = await readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
  const q = index.queries.find((x) => x.kind === "partition")!;
  const call = calls(q).find((c) => c.name === "Web.Contents")!;
  return origin(index, q, call.args[0]!);
}

describe("the resolver on a cycle under steps each read twice", () => {
  // Each step reads the one before twice, and the first reads a cycle: 2^30 paths, one answer.
  const doubling = letOf(
    ["a = b", "b = a", "s0 = a", ...range(30, (i) => `s${i + 1} = s${i} & s${i}`)],
    "Web.Contents(s30)",
  );
  it(`reads 30 doubling steps as unknown, as before, in under ${BOUND_MS / 1000} seconds`, async () => {
    const started = performance.now();
    const result = await lint([table("T", doubling)], { config: { failOn: "none" } });
    expect(await addressOrigin(doubling)).toBe("unknown");
    const ms = performance.now() - started;
    expect(result.summary.ruleErrors).toEqual([]);
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
});

describe("the resolver past its depth cap", () => {
  // Deeper than one walk goes (500 nodes): the walk starts again from where the cap stopped it.
  const chain = (step: (i: number) => string) =>
    letOf(
      ['s0 = Text.Combine({"https://", "api.example.com"})', ...range(4999, step)],
      "Web.Contents(s4999)",
    );
  it.each([
    ["each naming the one before", (i: number) => `s${i + 1} = s${i}`],
    ["each joining the one before to a text", (i: number) => `s${i + 1} = s${i} & "/"`],
  ])(
    "reads 5,000 steps %s as a short chain reads them, with no rule error",
    async (_, step) => {
      const m = chain(step);
      const result = await lint([table("T", m)], { config: { failOn: "none" } });
      expect(result.summary.ruleErrors).toEqual([]);
      expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
      expect(result.findings.filter((f) => f.ruleId === "DYNAMIC_DATA_SOURCE")).toHaveLength(1);
      expect(await addressOrigin(m)).toBe("computed");
    },
    120_000,
  );
});
