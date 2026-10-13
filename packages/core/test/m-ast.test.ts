import { Language } from "@microsoft/powerquery-parser";
import { describe, expect, it } from "vitest";
import { calls, identifierName, nodeOf, stepOf, textValue, unwrap } from "../src/m/ast.js";
import { parseM } from "../src/m/parse.js";
import type { MQuery } from "../src/m/types.js";

/** A query for one M text, parsed, as readM would make it. */
async function query(text: string, name = "Q"): Promise<MQuery> {
  const parsed = await parseM(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return {
    kind: "expression",
    name,
    owner: { name } as never,
    text,
    file: "q.tmdl",
    valueLine: 1,
    ast: parsed.ast,
    nodeIdMapCollection: parsed.nodeIdMapCollection,
  };
}

describe("identifierName and textValue", () => {
  it('unquote M\'s #"..." identifiers and text literals', () => {
    expect(identifierName('#"Sorted Rows"')).toBe("Sorted Rows");
    expect(identifierName('#"say ""hi"""')).toBe('say "hi"');
    expect(identifierName("Source")).toBe("Source");
  });
  it("reads a text literal's value, and nothing for a number", async () => {
    const q = await query('{"a ""b""", 1}');
    const literals = q.nodeIdMapCollection!.idsByNodeKind.get(
      Language.Ast.NodeKind.LiteralExpression,
    )!;
    const values = [...literals].sort((a, b) => a - b).map((id) => textValue(nodeOf(q, id)));
    expect(values).toEqual(['a "b"', undefined]);
  });
  it("takes meta and parentheses off a value", async () => {
    const q = await query('("x") meta [IsParameterQuery = true]');
    expect(textValue(unwrap(q.ast!))).toBe("x");
  });
});

describe("calls", () => {
  it("lists each invocation of a named function, with its arguments, in text order", async () => {
    const q = await query(
      'let\n    Source = Web.Contents("https://api.example.com", [RelativePath = "v1"]),\n    Typed = Table.TransformColumnTypes(Source, {})\nin\n    Typed',
    );
    expect(calls(q).map((c) => [c.name, c.args.length])).toEqual([
      ["Web.Contents", 2],
      ["Table.TransformColumnTypes", 2],
    ]);
  });
  it('names a call through @ and #"..." as M compares it', async () => {
    const q = await query('let f = (x) => x, #"My Fn" = f in @f(1) + #"My Fn"(2)');
    expect(calls(q).map((c) => c.name)).toEqual(["f", "My Fn"]);
  });
  it("lists nested calls in text order, the outer call first", async () => {
    const q = await query("f(g(1), h(2))");
    expect(calls(q).map((c) => c.name)).toEqual(["f", "g", "h"]);
  });
});

describe("stepOf", () => {
  it("names the outermost let step holding a node, through meta and nested lets", async () => {
    const q = await query(
      'let\n    #"Sorted Rows" = let inner = Table.Sort(T, {}) in inner,\n    Done = 1\nin\n    Done',
    );
    const sort = calls(q).find((c) => c.name === "Table.Sort")!;
    expect(stepOf(q, sort.node)).toBe("Sorted Rows");
  });
  it("is undefined outside any step, and for M with no let", async () => {
    const q = await query('Web.Contents("https://api.example.com")');
    expect(stepOf(q, calls(q)[0]!.node)).toBeUndefined();
  });
});
