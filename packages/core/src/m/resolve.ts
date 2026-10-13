import { Language } from "@microsoft/powerquery-parser";
import { identifierName, nodeOf, parentOf, unwrap } from "./ast.js";
import type { MIndex, MQuery } from "./types.js";

type Node = Language.Ast.TNode;
const Kind = Language.Ast.NodeKind;

/** Where a name in M gets its value (v3 spec, section 8). */
export type Resolution =
  | { kind: "row" }
  | { kind: "parameter"; node: Node }
  | { kind: "value"; node: Node }
  | { kind: "modelParameter"; query: MQuery; value: Node }
  | { kind: "query"; query: MQuery }
  | { kind: "library" }
  | { kind: "unknown" };

/**
 * A shared expression's value when it is a Power Query parameter, `<value> meta [IsParameterQuery =
 * true, ...]`; undefined for any other query.
 */
export function isModelParameter(q: MQuery): Node | undefined {
  if (q.kind !== "expression" || q.ast?.kind !== Kind.MetadataExpression) return undefined;
  const meta = unwrap(q.ast.right);
  if (meta.kind !== Kind.RecordExpression && meta.kind !== Kind.RecordLiteral) return undefined;
  const flag = meta.content.elements.find(
    (csv) => identifierName(csv.node.key.literal) === "IsParameterQuery",
  );
  const value = flag?.node.value;
  return value?.kind === Kind.LiteralExpression && value.literal === "true"
    ? q.ast.left
    : undefined;
}

/**
 * The variables a let binds, the fields a record's other fields see, a function's parameters.
 * `skip` names a pair to leave out: the one whose initializer holds the name being resolved.
 */
function bindingIn(
  scope: Node,
  name: string,
  skip: (pair: Node) => boolean,
): Resolution | undefined {
  if (scope.kind === Kind.LetExpression) {
    const pair = scope.variableList.elements.find(
      (csv) => identifierName(csv.node.key.literal) === name && !skip(csv.node),
    );
    return pair ? { kind: "value", node: pair.node.value } : undefined;
  }
  if (scope.kind === Kind.RecordExpression) {
    const field = scope.content.elements.find(
      (csv) => identifierName(csv.node.key.literal) === name && !skip(csv.node),
    );
    return field ? { kind: "value", node: field.node.value } : undefined;
  }
  if (scope.kind === Kind.FunctionExpression) {
    const param = scope.parameters.content.elements.find(
      (csv) => identifierName(csv.node.name.literal) === name,
    );
    return param ? { kind: "parameter", node: param.node } : undefined;
  }
  if (scope.kind === Kind.EachExpression && name === "_") return { kind: "row" };
  return undefined;
}

/**
 * Where an identifier gets its value: the nearest enclosing `each`, function, `let`, or record that
 * binds it, then the model's parameters, then its other queries by name (shared expressions first,
 * then tables' queries). A name with a `.` is a library function; anything else is unknown. A node
 * that is not an identifier is unknown.
 */
export function resolve(m: MIndex, q: MQuery, node: Node): Resolution {
  if (node.kind !== Kind.IdentifierExpression) return { kind: "unknown" };
  const name = identifierName(node.identifier.literal);
  // M's exclusive identifier leaves a binding out of its own initializer; only `@name` sees it.
  const path = new Set<number>([node.id]);
  const skip = (pair: Node) => !node.inclusiveConstant && path.has(pair.id);
  for (let scope = parentOf(q, node); scope; scope = parentOf(q, scope)) {
    const found = bindingIn(scope, name, skip);
    if (found) return found;
    path.add(scope.id);
  }
  const shared = m.queries.find((x) => x.kind === "expression" && x.name === name && x !== q);
  if (shared) {
    const value = isModelParameter(shared);
    return value
      ? { kind: "modelParameter", query: shared, value }
      : { kind: "query", query: shared };
  }
  // Every query of a table carries the table's name; none resolves to its own table.
  const own = q.kind !== "expression" ? q.name : undefined;
  const table = m.queries.find((x) => x.kind !== "expression" && x.name === name && x.name !== own);
  if (table) return { kind: "query", query: table };
  return name.includes(".") ? { kind: "library" } : { kind: "unknown" };
}

/** Where a value comes from, as the data source rule reads it (v3 spec, section 8). */
export type Origin = "static" | "unknown" | "computed" | "row";
/** Worst last: a value is as bad as the worst thing it reaches. */
export const ORIGIN_ORDER: readonly Origin[] = ["static", "unknown", "computed", "row"];
const worst = (origins: Origin[]): Origin =>
  origins.reduce<Origin>(
    (w, o) => (ORIGIN_ORDER.indexOf(o) > ORIGIN_ORDER.indexOf(w) ? o : w),
    "static",
  );

/** A record or list written in place, whose fields or items are known without reading data. */
const isLiteralContainer = (n: Node): boolean =>
  n.kind === Kind.RecordExpression ||
  n.kind === Kind.RecordLiteral ||
  n.kind === Kind.ListExpression ||
  n.kind === Kind.ListLiteral;

/**
 * Where a value comes from: `static` for literals, model parameters, and what joins or chooses
 * among them; `unknown` for a function's parameter, a name nothing defines, a field or item of a
 * record or list written in place, or a cycle; `computed` for a function call anywhere in it;
 * `row` for `_` or a field or item of anything else. A value is the worst of what it reaches.
 * Each node is followed once, so a cycle reads as unknown.
 */
export function origin(m: MIndex, q: MQuery, node: Node, seen: Set<string> = new Set()): Origin {
  const key = `${q.kind}:${q.name}:${node.id}`;
  if (seen.has(key)) return "unknown";
  seen.add(key);
  switch (node.kind) {
    case Kind.LiteralExpression:
    case Kind.Constant:
      return "static";
    case Kind.IdentifierExpression: {
      const r = resolve(m, q, node);
      if (r.kind === "row") return "row";
      if (r.kind === "value") return origin(m, q, r.node, seen);
      if (r.kind === "modelParameter" || r.kind === "library") return "static";
      if (r.kind === "query") {
        const body = r.query.ast && unwrap(r.query.ast);
        if (!body || body.kind === Kind.FunctionExpression) return "unknown";
        return origin(m, r.query, body, seen);
      }
      return "unknown";
    }
    case Kind.FieldSelector:
    case Kind.FieldProjection:
      return "row";
    case Kind.LetExpression:
      return origin(m, q, node.expression, seen);
    case Kind.FunctionExpression:
    case Kind.EachExpression:
      return "unknown";
    case Kind.RecursivePrimaryExpression: {
      const steps = node.recursiveExpressions.elements;
      const at = steps.findIndex((s) => s.kind === Kind.InvokeExpression);
      const invoke = steps[at];
      if (invoke && invoke.kind === Kind.InvokeExpression) {
        // A field or an item of what a call returns is data the call read.
        const read = steps.slice(at + 1).some((s) => s.kind !== Kind.InvokeExpression);
        return worst([
          read ? "row" : "computed",
          ...invoke.content.elements.map((csv) => origin(m, q, csv.node, seen)),
        ]);
      }
      // A field or an item: of a record or list written in place, or a name bound to one through
      // variables, queries, and lets' results, it is known.
      let container = unwrap(node.head);
      let cq = q;
      for (;;) {
        // A let stands for what its `in` returns.
        if (container.kind === Kind.LetExpression) {
          container = unwrap(container.expression);
          continue;
        }
        if (container.kind !== Kind.IdentifierExpression) break;
        const key = `${cq.kind}:${cq.name}:${container.id}`;
        if (seen.has(key)) return "unknown";
        seen.add(key);
        const r = resolve(m, cq, container);
        if (r.kind === "value") container = unwrap(r.node);
        else if (r.kind === "query" && r.query.ast) {
          cq = r.query;
          container = unwrap(r.query.ast);
        } else break;
      }
      return isLiteralContainer(container) ? "unknown" : "row";
    }
    default: {
      const children = q.nodeIdMapCollection?.childIdsById.get(node.id) ?? [];
      return worst(
        children
          .map((id) => nodeOf(q, id))
          .filter((n): n is Node => n !== undefined)
          .map((n) => origin(m, q, n, seen)),
      );
    }
  }
}
