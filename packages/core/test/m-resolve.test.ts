import { Language } from "@microsoft/powerquery-parser";
import { describe, expect, it } from "vitest";
import type { LintFile } from "../src/engine/lint.js";
import { calls, identifierName, nodeOf, textValue } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { resolve } from "../src/m/resolve.js";
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
