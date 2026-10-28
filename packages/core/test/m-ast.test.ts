import { Language } from "@microsoft/powerquery-parser";
import { describe, expect, it } from "vitest";
import {
  callOf,
  calls,
  identifierName,
  isWithin,
  nodeOf,
  nodesOfKind,
  nodesWithin,
  stepOf,
  textLiterals,
  textValue,
  unwrap,
} from "../src/m/ast.js";
import { parseM } from "../src/m/parse.js";
import type { MQuery } from "../src/m/types.js";

const Kind = Language.Ast.NodeKind;

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

describe("textLiterals", () => {
  it("lists every text literal in text order with its value, and nothing else", async () => {
    const q = await query('let a = "one", b = 2, c = {"two", true} in "th""ree"');
    expect(textLiterals(q).map((l) => l.value)).toEqual(["one", "two", 'th"ree']);
    expect(
      textLiterals(q).every((l) => l.node.kind === Language.Ast.NodeKind.LiteralExpression),
    ).toBe(true);
  });
  it("finds none in a query that did not parse", () => {
    expect(
      textLiterals({
        kind: "expression",
        name: "Q",
        owner: { name: "Q" } as never,
        text: "",
        file: "q.tmdl",
        valueLine: 1,
      }),
    ).toEqual([]);
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

describe("callOf, nodesOfKind, and isWithin", () => {
  it("reads a node as a call to a named function, and nothing else as one", async () => {
    const q = await query('let a = Table.Sort(S, {"x"}), b = (Table.Sort)(S, {}), c = S{0} in a');
    const nodes = nodesOfKind(q, Language.Ast.NodeKind.RecursivePrimaryExpression);
    expect(nodes.map((n) => callOf(n)?.name)).toEqual(["Table.Sort", undefined, undefined]);
    expect(callOf(nodes[0])?.args).toHaveLength(2);
    expect(callOf(undefined)).toBeUndefined();
  });
  it("lists the nodes of several kinds in text order, and none for M that did not parse", async () => {
    const q = await query("each [a] < 1 and [b] = 2 and [c] >= 3");
    const kinds = nodesOfKind(
      q,
      Language.Ast.NodeKind.EqualityExpression,
      Language.Ast.NodeKind.RelationalExpression,
    ).map((n) => n.kind);
    expect(kinds).toEqual([
      Language.Ast.NodeKind.RelationalExpression,
      Language.Ast.NodeKind.EqualityExpression,
      Language.Ast.NodeKind.RelationalExpression,
    ]);
    expect(
      nodesOfKind(
        {
          kind: "expression",
          name: "Q",
          owner: { name: "Q" } as never,
          text: "",
          file: "q.tmdl",
          valueLine: 1,
        },
        Language.Ast.NodeKind.RelationalExpression,
      ),
    ).toEqual([]);
  });
  it("tells whether a node sits inside another", async () => {
    const q = await query("Table.SelectRows(S, each [a] < 1)");
    const [select] = calls(q);
    const [comparison] = nodesOfKind(q, Language.Ast.NodeKind.RelationalExpression);
    expect(isWithin(q, comparison!, select!.args[1]!)).toBe(true);
    expect(isWithin(q, comparison!, comparison!)).toBe(true);
    expect(isWithin(q, select!.args[0]!, select!.args[1]!)).toBe(false);
  });
  it("nodesWithin finds a node's own descendants of a kind, in text order, and nothing outside it", async () => {
    const q = await query("let a = 1 < 2, b = Table.SelectRows(t, each [x] < 3 and [y] = 4) in b");
    const select = calls(q).find((c) => c.name === "Table.SelectRows")!;
    const found = nodesWithin(
      q,
      select.args[1]!,
      Kind.RelationalExpression,
      Kind.EqualityExpression,
    );
    expect(found.map((n) => n.kind)).toEqual([Kind.RelationalExpression, Kind.EqualityExpression]);
  });
});
