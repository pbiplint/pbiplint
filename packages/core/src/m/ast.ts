import { Language } from "@microsoft/powerquery-parser";
import type { MQuery } from "./types.js";

type Node = Language.Ast.TNode;
const Kind = Language.Ast.NodeKind;

/** An identifier as M compares it: `#"Sorted Rows"` is `Sorted Rows`, with doubled quotes undone. */
export const identifierName = (literal: string): string =>
  literal.startsWith('#"') ? literal.slice(2, -1).replace(/""/g, '"') : literal;

/** A text literal's value, without its quotes and with doubled quotes undone; undefined for any other node. */
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

/** Every invocation in a query whose function is named by an identifier, in text order. */
export function calls(q: MQuery): MCall[] {
  const ids =
    q.nodeIdMapCollection?.idsByNodeKind.get(Kind.RecursivePrimaryExpression) ?? new Set<number>();
  const out: MCall[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const n = nodeOf(q, id);
    if (n?.kind !== Kind.RecursivePrimaryExpression || n.head.kind !== Kind.IdentifierExpression)
      continue;
    const first = n.recursiveExpressions.elements[0];
    if (first?.kind !== Kind.InvokeExpression) continue;
    out.push({
      name: identifierName(n.head.identifier.literal),
      args: first.content.elements.map((csv) => csv.node),
      node: n,
    });
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
