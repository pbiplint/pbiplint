import { Language } from "@microsoft/powerquery-parser";
import { describe, expect, it } from "vitest";
import { type LintFile, lint } from "../src/engine/lint.js";
import { calls, identifierName, nodesOfKind } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { boundValue, origin } from "../src/m/resolve.js";
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

/** The M index of a partition of these M lines, and its query. */
async function indexed(m: string[]) {
  const files = [table("T", m)];
  const index = await readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
  return { index, q: index.queries.find((x) => x.kind === "partition")! };
}

/** The origin of the address of the first `Web.Contents` call in a partition of these M lines. */
async function addressOrigin(m: string[]): Promise<string> {
  const { index, q } = await indexed(m);
  const call = calls(q).find((c) => c.name === "Web.Contents")!;
  return origin(index, q, call.args[0]!);
}

/** Lint one table of these M lines, timed, and count its findings by rule. */
async function timedLint(m: string[]) {
  const started = performance.now();
  const result = await lint([table("T", m)], { config: { failOn: "none" } });
  const ms = performance.now() - started;
  const count = (id: string) => result.findings.filter((f) => f.ruleId === id).length;
  return { result, ms, count };
}

/** Steps `a0 = a1` to `a<n-1> = a0`: a cycle of `n` names. */
const cycle = (n: number): string[] => range(n, (i) => `a${i} = a${(i + 1) % n}`);

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

describe("the resolver on long chains and cycles", () => {
  const chain = (step: (i: number) => string) =>
    letOf(
      ['s0 = Text.Combine({"https://", "api.example.com"})', ...range(9999, step)],
      "Web.Contents(s9999)",
    );
  it.each([
    ["each naming the one before", (i: number) => `s${i + 1} = s${i}`],
    ["each joining the one before to a text", (i: number) => `s${i + 1} = s${i} & "/"`],
  ])(
    "reads 10,000 steps %s as a short chain reads them, with no rule error",
    async (_, step) => {
      const m = chain(step);
      const { result, ms, count } = await timedLint(m);
      expect(result.summary.ruleErrors).toEqual([]);
      expect(count("PARSE_ISSUE")).toBe(0);
      expect(count("DYNAMIC_DATA_SOURCE")).toBe(1);
      expect(await addressOrigin(m)).toBe("computed");
      expect(ms).toBeLessThan(BOUND_MS);
    },
    120_000,
  );
  it("reads a cycle of 10,000 names as unknown, with no rule error", async () => {
    const m = letOf(cycle(10_000), "Web.Contents(a5)");
    const { result, ms, count } = await timedLint(m);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(count("PARSE_ISSUE")).toBe(0);
    expect(await addressOrigin(m)).toBe("unknown");
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
  it(`reads a cycle of 501 names for 1,000 calls in under ${BOUND_MS / 1000} seconds`, async () => {
    const m = letOf(
      [...cycle(501), ...range(1000, (i) => `c${i} = Web.Contents(a${i % 501})`)],
      "c0",
    );
    const { result, ms, count } = await timedLint(m);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(count("DYNAMIC_DATA_SOURCE")).toBe(0);
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
  it("keeps a value's own call beside a cycle of 501 names it reads", async () => {
    const m = letOf(cycle(501), "Web.Contents(Text.From(1) & a5)");
    const { count } = await timedLint(m);
    expect(count("DYNAMIC_DATA_SOURCE")).toBe(1);
    expect(await addressOrigin(m)).toBe("computed");
  });
  it(`reads a field at the end of 4,000 names for 4,000 calls in under ${BOUND_MS / 1000} seconds`, async () => {
    const m = letOf(
      [
        'r0 = Sql.Database("sql.example.com", "Config")',
        ...range(3999, (i) => `r${i + 1} = r${i}`),
        ...range(4000, (i) => `c${i} = Web.Contents(r3999{0}[a])`),
      ],
      "c0",
    );
    const { result, ms, count } = await timedLint(m);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(count("DYNAMIC_DATA_SOURCE")).toBe(4000);
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
  it(`follows every name of a cycle of 4,000 in under ${BOUND_MS / 1000} seconds, each to itself`, async () => {
    const { index, q } = await indexed(letOf(cycle(4000), "Web.Contents(a5)"));
    const names = nodesOfKind(q, Language.Ast.NodeKind.IdentifierExpression);
    const started = performance.now();
    for (const n of names) boundValue(index, q, n);
    const ms = performance.now() - started;
    const call = calls(q).find((c) => c.name === "Web.Contents")!;
    const found = boundValue(index, q, call.args[0]!);
    expect(found.step).toBe("a5");
    expect(
      found.node.kind === Language.Ast.NodeKind.IdentifierExpression &&
        identifierName(found.node.identifier.literal),
    ).toBe("a6");
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
});
