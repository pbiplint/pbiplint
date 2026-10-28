import { Language } from "@microsoft/powerquery-parser";
import { describe, expect, it } from "vitest";
import { type LintFile, lint } from "../src/engine/lint.js";
import { calls, identifierName, nodesOfKind } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { buildIndexes } from "../src/index/build.js";
import { boundValue, origin } from "../src/m/resolve.js";
import { buildModel } from "../src/model/build.js";
import { eachQuery, mFinding } from "../src/rules/m-helpers.js";
import { HARDCODED_SECRET_IN_QUERY, LEGACY_EXCEL_FILE } from "../src/rules/pbiplint/power-query.js";
import type { Rule } from "../src/rules/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { mObjectNames } from "./helpers.js";

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
// to the next 5 s (spec 11.5). Measured on CI on October 28, 2026, the slowest guard in this file
// took 5.7 s on Node 20 (a field at the end of 8,000 names), so 3 x 5.7 s is 17.1 s: 20 s. The
// code before this fix took 40 s or more on every guard here, so each still catches a regression.
const BOUND_MS = 20_000;

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
  // Sized so the quadratic resolver of a005e4b fails clearly: 40 s here (8.1 s at 4,000), and 51 s
  // for the 10,000-name cycle below (8.0 s at 4,000), against 0.8 s and 0.2 s now on Michael's Mac.
  it(`reads a field at the end of 8,000 names for 8,000 calls in under ${BOUND_MS / 1000} seconds`, async () => {
    const m = letOf(
      [
        'r0 = Sql.Database("sql.example.com", "Config")',
        ...range(7999, (i) => `r${i + 1} = r${i}`),
        ...range(8000, (i) => `c${i} = Web.Contents(r7999{0}[a])`),
      ],
      "c0",
    );
    const { result, ms, count } = await timedLint(m);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(count("DYNAMIC_DATA_SOURCE")).toBe(8000);
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
  it(`follows every name of a cycle of 10,000 in under ${BOUND_MS / 1000} seconds, each to itself`, async () => {
    const { index, q } = await indexed(letOf(cycle(10_000), "Web.Contents(a5)"));
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

/** A model of these tables. */
const model = (...tables: LintFile[]): LintFile[] => [
  { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
  ...tables,
];

/** A fixture credential: the shape the secret rule reads, marked as not real. */
const fake = (kind: string, n: string): string => `pbiplint-fixture-${kind}-${n}-notreal`;

/** The meta record Desktop writes after a text parameter's value. */
const textMeta = ' meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]';

/** A rule that throws on query 'A' and reports every other query, run per query. */
const throwsOnA: Rule = {
  id: "TEST_EACH_QUERY",
  name: "Throws on one query",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition"],
  layer: "powerquery",
  needs: ["model"],
  description: "Throws on query 'A'.",
  references: [],
  status: "builtin",
  check: (_p, ctx) => {
    const m = ctx.indexes.m;
    return eachQuery(ctx, m.queries, (q) => {
      if (q.name === "A") throw new RangeError("Maximum call stack size exceeded");
      return q.ast ? [mFinding(m, q, q.ast, "reported")] : [];
    });
  },
};

describe("a deep tree in one query (v3 spec, section 8, amended October 27, 2026)", () => {
  /**
   * A header of `groups` bracketed runs of 1,000 calls each, joined with `&`, each call on its own
   * line: one tree `groups` x 1,000 levels deep that stays inside the read budget (v3 spec, section
   * 7), which charges a run of `&` by its square and a line by its tokens' square. Calls, not
   * literals, so the joined header holds no text that could itself read as a credential.
   */
  const joinedHeader = (groups: number): string[] => {
    const run = (k: number) => range(1000, (i) => `Text.From(${k * 1000 + i})`).join(" &\n");
    const parts = [
      "(".repeat(groups - 1) + run(0),
      ...range(groups - 1, (k) => `) & ${run(k + 1)}`),
    ];
    return [
      'Web.Contents("https://api.example.com", [Headers = [Authorization =',
      ...parts.join("\n").split("\n"),
      "]])",
    ];
  };
  it.each([
    ["12,000", 12],
    ["100,000", 100],
  ])(
    "keeps HARDCODED_SECRET_IN_QUERY running past a header joined from %s parts",
    async (_, groups) => {
      const result = await lint(
        model(
          table("Joined", joinedHeader(groups)),
          table("Keyed", [
            `Web.Contents("https://api.example.com", [Headers = [#"x-api-key" = "${fake("key", "0201")}"]])`,
          ]),
        ),
        { config: { failOn: "none" } },
      );
      expect(result.summary.ruleErrors).toEqual([]);
      expect(
        result.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => f.detail),
      ).toEqual([]);
      expect(
        result.findings
          .filter((f) => f.ruleId === "HARDCODED_SECRET_IN_QUERY")
          .map((f) => f.objectName),
      ).toEqual(["Keyed"]);
    },
    120_000,
  );
  it("keeps DYNAMIC_DATA_SOURCE running past an address joined from 3,000 calls", async () => {
    const parts = Array.from({ length: 3_000 }, () => "Text.From(1)").join(" & ");
    const result = await lint(model(table("Deep", [`Web.Contents(${parts})`])), {
      config: { failOn: "none" },
    });
    expect(result.summary.ruleErrors).toEqual([]);
    expect(
      result.findings.filter((f) => f.ruleId === "DYNAMIC_DATA_SOURCE").map((f) => f.detail),
    ).toEqual(["query 'Deep': Web.Contents's address is built by a function call"]);
  }, 120_000);
  it("keeps MINIMIZE_POWER_QUERY_TRANSFORMATIONS running past 12,000 chained options steps", async () => {
    const steps = [
      'o0 = [Query = "select 1"]',
      ...range(11_999, (i) => `o${i + 1} = o${i}`),
      'src = Sql.Database("sql.example.com", "Sales", o11999)',
    ];
    const result = await lint(model(table("Native", letOf(steps, "src"))), {
      config: { failOn: "none" },
    });
    expect(result.summary.ruleErrors).toEqual([]);
    expect(
      result.findings
        .filter((f) => f.ruleId === "MINIMIZE_POWER_QUERY_TRANSFORMATIONS")
        .map((f) => f.objectName),
    ).toEqual(["Native"]);
  }, 120_000);
  it("records one query's error as a rule error naming the query, and keeps the other queries' findings", async () => {
    const result = await lint(model(table("A", ["1"]), table("B", ["2"])), {
      rules: [throwsOnA],
      config: { failOn: "none" },
    });
    expect(result.findings.map((f) => f.objectName)).toEqual(["B"]);
    expect(result.summary.ruleErrors).toEqual([
      { id: "TEST_EACH_QUERY", message: "query 'A': Maximum call stack size exceeded" },
    ]);
  });
  it.each([
    [
      "HARDCODED_SECRET_IN_QUERY",
      HARDCODED_SECRET_IN_QUERY,
      "Key",
      `expression Key = "${fake("key", "0202")}"${textMeta}\n\n`,
      'Web.Contents("https://api.example.com", [Headers = [#"x-api-key" = Key]])',
    ],
    [
      "LEGACY_EXCEL_FILE",
      LEGACY_EXCEL_FILE,
      "Workbook",
      `expression Workbook = "C:\\Data\\Sales.xls"${textMeta}\n\n`,
      "Excel.Workbook(File.Contents(Workbook))",
    ],
  ])(
    "keeps %s's finding on a shared value when the first query reading it fails partway",
    async (_, rule, holder, expression, reads) => {
      const files = [
        ...model(table("A", [reads]), table("B", [reads])),
        { path: "definition/expressions.tmdl", text: expression },
      ];
      const built = buildModel(files.map((f) => parseTmdl(f.path, f.text)));
      const read = await readM(built, files);
      // The first finding's location throws: its query fails after it has seen the shared value.
      let failed = false;
      const m = {
        ...read,
        locate: (...args: Parameters<typeof read.locate>) => {
          if (!failed) {
            failed = true;
            throw new RangeError("Maximum call stack size exceeded");
          }
          return read.locate(...args);
        },
      };
      const errors: string[] = [];
      const findings = rule.check(
        { model: built },
        {
          indexes: buildIndexes({ model: built }, m),
          options: {},
          reportError: (e) => errors.push(e),
        },
      );
      expect(errors).toEqual(["query 'A': Maximum call stack size exceeded"]);
      expect(findings.map((f) => f.objectName)).toEqual([holder]);
    },
  );
  it("throws one query's error from a rule run without the engine, as before", async () => {
    const tmdl = table("A", ["1"]).text;
    await expect(mObjectNames(throwsOnA, tmdl)).rejects.toThrow("Maximum call stack size exceeded");
  });
});
