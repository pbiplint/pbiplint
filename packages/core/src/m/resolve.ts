import { Language } from "@microsoft/powerquery-parser";
import { identifierName, parentOf, unwrap } from "./ast.js";
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
