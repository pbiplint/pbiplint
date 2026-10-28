import { Language } from "@microsoft/powerquery-parser";
import type { MQuery } from "./types.js";

type Node = Language.Ast.TNode;
const Kind = Language.Ast.NodeKind;

/** An identifier as M compares it: `#"Sorted Rows"` is `Sorted Rows`, with doubled quotes undone. */
export const identifierName = (literal: string): string =>
  literal.startsWith('#"') ? literal.slice(2, -1).replace(/""/g, '"') : literal;

/**
 * A text literal's value, without its quotes and with doubled quotes undone; undefined for any
 * other node. M escapes such as `#(lf)` are left as written.
 */
export function textValue(node: Node | undefined): string | undefined {
  return node?.kind === Kind.LiteralExpression && node.literalKind === Language.Ast.LiteralKind.Text
    ? node.literal.slice(1, -1).replace(/""/g, '"')
    : undefined;
}

/** A node of a parsed query, by id. */
export const nodeOf = (q: MQuery, id: number): Node | undefined =>
  q.nodeIdMapCollection?.astNodeById.get(id);

/** A node's parent in its query's tree; undefined at the root. */
export function parentOf(q: MQuery, node: Node): Node | undefined {
  const id = q.nodeIdMapCollection?.parentIdById.get(node.id);
  return id === undefined ? undefined : nodeOf(q, id);
}

/** A value with any `meta` record and parentheses taken off, as a parameter's literal is written. */
export function unwrap(node: Node): Node {
  let n = node;
  for (;;) {
    if (n.kind === Kind.MetadataExpression) n = n.left;
    else if (n.kind === Kind.ParenthesizedExpression) n = n.content;
    else return n;
  }
}

/** One invocation of a function named by an identifier: `Web.Contents(...)`, `@f(...)`, `#"My Fn"(...)`. */
export interface MCall {
  name: string;
  args: Node[];
  /** The whole call, from its name to its closing parenthesis. */
  node: Node;
}

/** A node as an invocation of a function named by an identifier; undefined for any other node. */
export function callOf(n: Node | undefined): MCall | undefined {
  if (n?.kind !== Kind.RecursivePrimaryExpression || n.head.kind !== Kind.IdentifierExpression)
    return undefined;
  const first = n.recursiveExpressions.elements[0];
  if (first?.kind !== Kind.InvokeExpression) return undefined;
  return {
    name: identifierName(n.head.identifier.literal),
    args: first.content.elements.map((csv) => csv.node),
    node: n,
  };
}

/** Every invocation in a query whose function is named by an identifier, in text order. */
export function calls(q: MQuery): MCall[] {
  const ids =
    q.nodeIdMapCollection?.idsByNodeKind.get(Kind.RecursivePrimaryExpression) ?? new Set<number>();
  const out: MCall[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const c = callOf(nodeOf(q, id));
    if (c) out.push(c);
  }
  return out;
}

/** Nodes in text order, an outer node before an inner one that starts with it. */
const inTextOrder = (nodes: Node[]): Node[] =>
  nodes.sort(
    (a, b) =>
      a.tokenRange.tokenIndexStart - b.tokenRange.tokenIndexStart ||
      b.tokenRange.tokenIndexEnd - a.tokenRange.tokenIndexEnd,
  );

/** Every node of the given kinds in a query, in text order. */
export function nodesOfKind(q: MQuery, ...kinds: Language.Ast.NodeKind[]): Node[] {
  return inTextOrder(
    kinds
      .flatMap((k) => [...(q.nodeIdMapCollection?.idsByNodeKind.get(k) ?? [])])
      .map((id) => nodeOf(q, id))
      .filter((n): n is Node => n !== undefined),
  );
}

/** `root` and every node below it, of the given kinds, in text order. */
export function nodesWithin(q: MQuery, root: Node, ...kinds: Language.Ast.NodeKind[]): Node[] {
  const out: Node[] = [];
  for (const stack = [root]; stack.length;) {
    const n = stack.pop()!;
    if (kinds.includes(n.kind)) out.push(n);
    for (const id of q.nodeIdMapCollection?.childIdsById.get(n.id) ?? []) {
      const child = nodeOf(q, id);
      if (child) stack.push(child);
    }
  }
  return inTextOrder(out);
}

/** Whether `node` is `ancestor` or sits inside it. */
export function isWithin(q: MQuery, node: Node, ancestor: Node): boolean {
  for (let n: Node | undefined = node; n; n = parentOf(q, n)) if (n.id === ancestor.id) return true;
  return false;
}

/** Every text literal in a query, in text order, with its value as `textValue` reads it. */
export function textLiterals(q: MQuery): { node: Node; value: string }[] {
  const ids = q.nodeIdMapCollection?.idsByNodeKind.get(Kind.LiteralExpression) ?? new Set<number>();
  const out: { node: Node; value: string }[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const node = nodeOf(q, id);
    const value = textValue(node);
    if (node && value !== undefined) out.push({ node, value });
  }
  return out;
}

/**
 * The name of the outermost `let` step that holds a node, as Applied steps lists it, or undefined
 * when the node is in no step: the query has no `let`, or the node is in its `in` expression.
 */
export function stepOf(q: MQuery, node: Node): string | undefined {
  if (!q.ast) return undefined;
  const root = unwrap(q.ast);
  if (root.kind !== Kind.LetExpression) return undefined;
  let child: Node | undefined = node;
  let parent = parentOf(q, node);
  while (parent) {
    if (child.kind === Kind.IdentifierPairedExpression) {
      // The pair sits in a Csv inside the let's variable list: three steps up is the let.
      const csv = parent;
      const list = parentOf(q, csv);
      const owner = list && parentOf(q, list);
      if (owner?.id === root.id) return identifierName(child.key.literal);
    }
    child = parent;
    parent = parentOf(q, parent);
  }
  return undefined;
}
