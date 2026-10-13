import { Language } from "@microsoft/powerquery-parser";
import { describe, expect, it } from "vitest";
import type { LintFile } from "../src/engine/lint.js";
import { calls, identifierName, nodeOf, textValue } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { boundValue, origin, resolve } from "../src/m/resolve.js";
import type { MIndex, MQuery } from "../src/m/types.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { fixturesDir, readModelFiles } from "./helpers.js";

/** The M index of one table's partition, with these shared expressions beside it. */
async function index(partition: string, expressions = ""): Promise<{ m: MIndex; q: MQuery }> {
  const files: LintFile[] = [
    {
      path: "definition/tables/T.tmdl",
      text: `table T\n\tpartition T = m\n\t\tmode: import\n\t\tsource = ${partition}\n`,
    },
    ...(expressions ? [{ path: "definition/expressions.tmdl", text: expressions }] : []),
  ];
  const m = await readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
  return { m, q: m.queries.find((x) => x.kind === "partition")! };
}

/** The resolution of the first argument of the first call to `fn` in the query. */
function argOf(m: MIndex, q: MQuery, fn = "Web.Contents") {
  const call = calls(q).find((c) => c.name === fn)!;
  return resolve(m, q, call.args[0]!);
}

describe("resolve", () => {
  it("finds a let variable, through nested lets, and gives its value", async () => {
    const { m, q } = await index(
      'let Url = "https://api.example.com", Inner = let x = 1 in Web.Contents(Url) in Inner',
    );
    const r = argOf(m, q);
    expect(r.kind).toBe("value");
    expect(r.kind === "value" && textValue(r.node)).toBe("https://api.example.com");
  });
  it("lets an inner let's variable hide an outer one of the same name", async () => {
    const { m, q } = await index(
      'let Url = "outer", Inner = let Url = "inner" in Web.Contents(Url) in Inner',
    );
    const r = argOf(m, q);
    expect(r.kind === "value" && textValue(r.node)).toBe("inner");
  });
  it("finds a function's parameter", async () => {
    const { m, q } = await index("let f = (url as text) => Web.Contents(url) in f");
    expect(argOf(m, q).kind).toBe("parameter");
  });
  it("reads _ inside each as row data", async () => {
    const { m, q } = await index('Table.AddColumn(S, "c", each Web.Contents(_))');
    expect(argOf(m, q).kind).toBe("row");
  });
  it("finds a record's field from another field's value", async () => {
    const { m, q } = await index(
      '[Url = "https://api.example.com", Body = Web.Contents(Url)][Body]',
    );
    expect(argOf(m, q).kind).toBe("value");
  });
  it("finds the model's parameters and other queries, and names nothing else", async () => {
    const shared =
      'expression ApiBase = "https://api.example.com" meta [IsParameterQuery=true, Type="Text"]\n\nexpression Helper = "x"\n';
    const { m, q } = await index(
      "{Web.Contents(ApiBase), Web.Contents(Helper), Web.Contents(Nowhere), Web.Contents(Text.From)}",
      shared,
    );
    const kinds = calls(q)
      .filter((c) => c.name === "Web.Contents")
      .map((c) => resolve(m, q, c.args[0]!).kind);
    expect(kinds).toEqual(["modelParameter", "query", "unknown", "library"]);
  });
  it('finds @name and #"quoted name" as the plain name', async () => {
    const { m, q } = await index(
      'let #"Base Url" = "https://api.example.com" in {Web.Contents(#"Base Url"), Web.Contents(@#"Base Url")}',
    );
    expect(
      calls(q)
        .filter((c) => c.name === "Web.Contents")
        .map((c) => resolve(m, q, c.args[0]!).kind),
    ).toEqual(["value", "value"]);
  });
  it("gives unknown for a node that is not an identifier", async () => {
    const { m, q } = await index('Web.Contents("https://api.example.com")');
    expect(argOf(m, q).kind).toBe("unknown");
  });
  it("resolves m-zoo's Range Shadowed: RangeEnd is the local step, RangeStart the parameter", async () => {
    const files = readModelFiles(`${fixturesDir}m-zoo.SemanticModel`);
    const m = await readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
    const q = m.queries.find((x) => x.name === "Range Shadowed")!;
    const ids = q.nodeIdMapCollection!.idsByNodeKind.get(
      Language.Ast.NodeKind.IdentifierExpression,
    )!;
    const named = (name: string) =>
      [...ids]
        .map((id) => nodeOf(q, id)!)
        .filter(
          (n) =>
            n.kind === Language.Ast.NodeKind.IdentifierExpression &&
            identifierName(n.identifier.literal) === name,
        );
    expect(named("RangeEnd").map((n) => resolve(m, q, n).kind)).toEqual(["value"]);
    expect(named("RangeStart").map((n) => resolve(m, q, n).kind)).toEqual(["modelParameter"]);
  });
});

/** Every use of a name in a query, in text order. */
function named(q: MQuery, name: string): Language.Ast.TNode[] {
  const ids = q.nodeIdMapCollection!.idsByNodeKind.get(Language.Ast.NodeKind.IdentifierExpression)!;
  return [...ids]
    .sort((a, b) => a - b)
    .map((id) => nodeOf(q, id)!)
    .filter(
      (n) =>
        n.kind === Language.Ast.NodeKind.IdentifierExpression &&
        identifierName(n.identifier.literal) === name,
    );
}

/** The M index of these files, as the model reads them. */
async function indexOf(files: LintFile[]): Promise<MIndex> {
  return readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files);
}

describe("resolve leaves a binding out of its own initializer", () => {
  it("reads a field's own name in its value as the let's variable outside", async () => {
    const { m, q } = await index('let a = "outer", r = [a = a] in r');
    const r = named(q, "a").map((n) => resolve(m, q, n));
    expect(r.map((x) => x.kind === "value" && textValue(x.node))).toEqual(["outer"]);
  });
  it("lets @name see the binding being initialized", async () => {
    const { m, q } = await index('let a = "outer", r = [a = @a] in r');
    const [use] = named(q, "a");
    const r = resolve(m, q, use!);
    expect(r.kind).toBe("value");
    expect(r.kind === "value" && r.node).toBe(use);
  });
  it("reads a let variable's own name in its value as the outer let's variable", async () => {
    const { m, q } = await index('let x = "outer", y = let x = x & "/v1" in x in y');
    const r = named(q, "x").map((n) => resolve(m, q, n));
    expect(r[0]!.kind === "value" && textValue(r[0]!.node)).toBe("outer");
    expect(r[1]!.kind === "value" && r[1]!.node.kind).toBe(
      Language.Ast.NodeKind.ArithmeticExpression,
    );
  });
  it("reads a let variable's own name in its value as the model's query of that name", async () => {
    const { m, q } = await index("let x = x in x", 'expression x = "shared"\n');
    expect(named(q, "x").map((n) => resolve(m, q, n).kind)).toEqual(["query", "value"]);
  });
  it("reads apikey in Query = [apikey = apikey] as the let step", async () => {
    const { m, q } = await index(
      'let apikey = "k", Source = Web.Contents("https://api.example.com", [Query = [apikey = apikey]]) in Source',
    );
    const r = named(q, "apikey").map((n) => resolve(m, q, n));
    expect(r.map((x) => x.kind === "value" && textValue(x.node))).toEqual(["k"]);
  });
});

describe("resolve never names the query asking", () => {
  it("does not resolve a table's name to another of that table's queries", async () => {
    const m = await indexOf([
      {
        path: "definition/tables/T.tmdl",
        text: 'table T\n\tpartition P1 = m\n\t\tmode: import\n\t\tsource = Web.Contents(T)\n\n\tpartition P2 = m\n\t\tmode: import\n\t\tsource = "x"\n',
      },
    ]);
    const q = m.queries.find((x) => x.kind === "partition" && x.text.includes("Web.Contents"))!;
    expect(argOf(m, q).kind).toBe("unknown");
  });
  it("does not resolve a shared expression's name to itself", async () => {
    const m = await indexOf([
      { path: "definition/expressions.tmdl", text: "expression Helper = Web.Contents(Helper)\n" },
    ]);
    const q = m.queries.find((x) => x.name === "Helper")!;
    expect(argOf(m, q).kind).toBe("unknown");
  });
});

describe("origin", () => {
  const shared =
    'expression ApiBase = "https://api.example.com" meta [IsParameterQuery=true, Type="Text"]\n\nexpression Environment = "Prod" meta [IsParameterQuery=true, Type="Text"]\n';
  const cases: [string, string, string][] = [
    ["a literal", 'Web.Contents("https://api.example.com")', "static"],
    ["a model parameter", "Web.Contents(ApiBase)", "static"],
    ["an & join of a parameter and a literal", 'Web.Contents(ApiBase & "/v1")', "static"],
    [
      "a let step holding a literal two scopes up",
      'let Url = "https://a.example.com", In1 = let In2 = let r = Web.Contents(Url) in r in In2 in In1',
      "static",
    ],
    [
      "if over a parameter (until the Desktop check)",
      'Web.Contents(if Environment = "Prod" then "https://a.example.com" else "https://b.example.com")',
      "static",
    ],
    [
      "a function's parameter (until the Desktop check)",
      "let f = (u) => Web.Contents(u) in f",
      "unknown",
    ],
    ["a name nothing defines", "Web.Contents(Nowhere)", "unknown"],
    [
      "a field of a record written as a literal",
      'Web.Contents([Url = "https://a.example.com"][Url])',
      "unknown",
    ],
    ["a function call", 'Web.Contents(Text.Combine({ApiBase, "v1"}))', "computed"],
    ["a field of row data in each", 'Table.AddColumn(S, "c", each Web.Contents([url]))', "row"],
    [
      "a field of a table read from a source",
      'let Config = Sql.Database("s.example", "d"), Url = Config{0}[BaseUrl] in Web.Contents(Url)',
      "row",
    ],
    ["_ in each", 'Table.AddColumn(S, "c", each Web.Contents(_))', "row"],
    ["a cycle", "let a = b, b = a in Web.Contents(a)", "unknown"],
    ["an @name self-reference", 'let a = @a & "x" in Web.Contents(a)', "unknown"],
  ];
  it.each(cases)("%s is %s", async (_label, partition, expected) => {
    const { m, q } = await index(partition, shared);
    const call = calls(q).find((c) => c.name === "Web.Contents")!;
    expect(origin(m, q, call.args[0]!)).toBe(expected);
  });
});

describe("origin of a field or item", () => {
  const originOf = async (partition: string, expressions = "") => {
    const { m, q } = await index(partition, expressions);
    const call = calls(q).find((c) => c.name === "Web.Contents")!;
    return origin(m, q, call.args[0]!);
  };
  it("is unknown for a field of a shared expression written as a record", async () => {
    expect(
      await originOf(
        "Web.Contents(Settings[BaseUrl])",
        'expression Settings = [BaseUrl = "https://a.example.com"]\n',
      ),
    ).toBe("unknown");
  });
  it("is unknown for a field of a shared expression whose let builds a record", async () => {
    expect(
      await originOf(
        "Web.Contents(Settings[BaseUrl])",
        'expression Settings = let Base = "https://a.example.com" in [BaseUrl = Base]\n',
      ),
    ).toBe("unknown");
  });
  it("is unknown for a field of a record through an alias", async () => {
    expect(
      await originOf('let r = [Url = "https://a.example.com"], r2 = r in Web.Contents(r2[Url])'),
    ).toBe("unknown");
  });
  it("is row for an item and field of a call's result", async () => {
    expect(
      await originOf('let S = Sql.Database("s.example", "d"){0}[BaseUrl] in Web.Contents(S)'),
    ).toBe("row");
  });
  it("is row for a field of a parsed document", async () => {
    expect(
      await originOf('let J = Json.Document(File.Contents("c:/a.json"))[url] in Web.Contents(J)'),
    ).toBe("row");
  });
  it("is unknown for a field of a function's parameter, as the parameter is", async () => {
    expect(await originOf("let f = (cfg) => Web.Contents(cfg[Url]) in f")).toBe("unknown");
  });
  it("is row for a field of _ inside each", async () => {
    expect(await originOf('Table.AddColumn(#table({}, {}), "R", each Web.Contents(_[url]))')).toBe(
      "row",
    );
  });
});

describe("boundValue", () => {
  /** What the first argument of the first call to `fn` stands for: the call it is, and the step that holds it. */
  async function bound(partition: string, fn = "Table.Distinct", expressions = "") {
    const { m, q } = await index(partition, expressions);
    const b = boundValue(m, q, calls(q).find((c) => c.name === fn)!.args[0]!);
    return {
      name: calls(q).find((c) => c.node.id === b.node.id)?.name,
      step: b.step,
      kind: b.node.kind,
    };
  }
  it("follows a name to the step that holds its value", async () => {
    expect(
      await bound(
        'let #"Sorted Rows" = Table.Sort(S, {"x"}), D = Table.Distinct(#"Sorted Rows", {"k"}) in D',
      ),
    ).toEqual({
      name: "Table.Sort",
      step: "Sorted Rows",
      kind: Language.Ast.NodeKind.RecursivePrimaryExpression,
    });
  });
  it("follows a step that only renames another, and takes parentheses off", async () => {
    expect(
      await bound(
        'let Sorted = Table.Sort(S, {"x"}), Again = (Sorted), D = Table.Distinct(Again, {"k"}) in D',
      ),
    ).toMatchObject({ name: "Table.Sort", step: "Sorted" });
  });
  it("gives a value written in place with no step", async () => {
    expect(await bound('Table.Distinct(Table.Sort(S, {"x"}), {"k"})')).toMatchObject({
      name: "Table.Sort",
      step: undefined,
    });
  });
  it("stops at a model parameter and at a name nothing defines", async () => {
    const parameter = await bound(
      'Table.Distinct(Customers, {"k"})',
      "Table.Distinct",
      'expression Customers = "x" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n',
    );
    expect(parameter).toEqual({
      name: undefined,
      step: undefined,
      kind: Language.Ast.NodeKind.IdentifierExpression,
    });
    expect((await bound('Table.Distinct(Nowhere, {"k"})')).kind).toBe(
      Language.Ast.NodeKind.IdentifierExpression,
    );
  });
  it("stops on a cycle", async () => {
    expect((await bound('let a = b, b = a, D = Table.Distinct(a, {"k"}) in D')).kind).toBe(
      Language.Ast.NodeKind.IdentifierExpression,
    );
  });
});
