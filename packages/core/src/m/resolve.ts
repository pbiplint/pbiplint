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

/** Each scope's bindings by name, in order: a `let`'s or a record's pairs, a function's parameters. */
const names = new WeakMap<Node, Map<string, Node[]>>();
function namesOf(scope: Node): Map<string, Node[]> {
  let map = names.get(scope);
  if (!map) {
    const out = new Map<string, Node[]>();
    const add = (name: string, n: Node) => {
      const list = out.get(name);
      if (list) list.push(n);
      else out.set(name, [n]);
    };
    if (scope.kind === Kind.LetExpression)
      for (const csv of scope.variableList.elements)
        add(identifierName(csv.node.key.literal), csv.node);
    else if (scope.kind === Kind.RecordExpression)
      for (const csv of scope.content.elements) add(identifierName(csv.node.key.literal), csv.node);
    else if (scope.kind === Kind.FunctionExpression)
      for (const csv of scope.parameters.content.elements)
        add(identifierName(csv.node.name.literal), csv.node);
    names.set(scope, (map = out));
  }
  return map;
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
  if (scope.kind === Kind.LetExpression || scope.kind === Kind.RecordExpression) {
    const pair = namesOf(scope)
      .get(name)
      ?.find((p) => !skip(p)) as Language.Ast.IdentifierPairedExpression | undefined;
    return pair ? { kind: "value", node: pair.value } : undefined;
  }
  if (scope.kind === Kind.FunctionExpression) {
    const param = namesOf(scope).get(name)?.[0];
    return param ? { kind: "parameter", node: param } : undefined;
  }
  if (scope.kind === Kind.EachExpression && name === "_") return { kind: "row" };
  return undefined;
}

/** A model's queries by name, in query order: shared expressions, and tables' queries. */
const queryNames = new WeakMap<
  MIndex,
  { shared: Map<string, MQuery[]>; tables: Map<string, MQuery[]> }
>();
function queriesNamed(m: MIndex): { shared: Map<string, MQuery[]>; tables: Map<string, MQuery[]> } {
  let found = queryNames.get(m);
  if (!found) {
    found = { shared: new Map(), tables: new Map() };
    for (const x of m.queries) {
      const map = x.kind === "expression" ? found.shared : found.tables;
      const list = map.get(x.name);
      if (list) list.push(x);
      else map.set(x.name, [x]);
    }
    queryNames.set(m, found);
  }
  return found;
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
  const named = queriesNamed(m);
  const shared = named.shared.get(name)?.find((x) => x !== q);
  if (shared) {
    const value = isModelParameter(shared);
    return value
      ? { kind: "modelParameter", query: shared, value }
      : { kind: "query", query: shared };
  }
  // Every query of a table carries the table's name; none resolves to its own table.
  const own = q.kind !== "expression" ? q.name : undefined;
  const table = named.tables.get(name)?.find((x) => x.name !== own);
  if (table) return { kind: "query", query: table };
  return name.includes(".") ? { kind: "library" } : { kind: "unknown" };
}

/** Where a value comes from, as the data source rule reads it (v3 spec, section 8). */
export type Origin = "static" | "unknown" | "chosen" | "parameter" | "computed" | "row";
/** Worst last: a value is as bad as the worst thing it reaches. */
export const ORIGIN_ORDER: readonly Origin[] = [
  "static",
  "unknown",
  "chosen",
  "parameter",
  "computed",
  "row",
];
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
 * Where a value comes from: `static` for literals, model parameters, and what joins them; `unknown`
 * for a name nothing defines, a field or item of a record or list written in place, or a cycle;
 * `chosen` for an `if ... then ... else`, whatever its branches, as Power BI Desktop reads it;
 * `parameter` for a custom function's parameter or a field of one; `computed` for a function call
 * anywhere in it; `row` for `_` or a field or item of anything else. A value is the worst of what
 * it reaches. An `if`'s condition adds nothing beyond `chosen`, and an `error` is static, since it
 * reaches no source. A node met again while it is being classified is a cycle, and reads as
 * unknown.
 */
export function origin(m: MIndex, q: MQuery, node: Node): Origin {
  // A value too deep to follow on one stack: the node the cap stopped at is classified first, from
  // a fresh stack, so its answer is remembered, and the walk above it is tried again.
  const pending = [{ q, node }];
  for (;;) {
    const top = pending[pending.length - 1]!;
    const w: Walk = { path: new Map(), answers: new Map(), low: Infinity };
    const answer = originOf(m, top.q, top.node, w);
    const deep = w.deep;
    if (!deep) {
      pending.pop();
      if (!pending.length) return answer;
    } else if (pending.some((p) => p.node === deep.node)) {
      // A cycle longer than the cap.
      return "unknown";
    } else pending.push(deep);
  }
}

/** How deep one walk of `origin` goes before it starts again from there, so the stack holds. */
const MAX_DEPTH = 500;

/** Each node's answer for the run, kept only when it does not depend on how the node was reached. */
const origins = new WeakMap<Node, Origin>();

/** One walk of `origin`. */
interface Walk {
  /** The nodes being classified, each with its depth. */
  path: Map<Node, number>;
  /** This walk's answers that depend on the path above them, which hold only within it. */
  answers: Map<Node, Origin>;
  /** The shallowest depth a cycle under the node being classified returned to. */
  low: number;
  /** The node the depth cap stopped at, which ends the walk. */
  deep?: { q: MQuery; node: Node };
}

/**
 * `origin` within one walk. A node's answer is remembered for the run when every cycle cut under it
 * returned to the node or below it, so it does not depend on the path above; otherwise it holds for
 * this walk only, so a node read many times is still classified once in it. MQuery and MIndex: a
 * query's nodes belong to one index, since the answers depend on the index's other queries; an
 * `MQuery` must never be shared between two `MIndex`es.
 */
function originOf(m: MIndex, q: MQuery, node: Node, w: Walk): Origin {
  if (w.deep) return "unknown";
  const known = origins.get(node);
  if (known) return known;
  const local = w.answers.get(node);
  if (local) {
    w.low = Math.min(w.low, 0);
    return local;
  }
  const at = w.path.get(node);
  if (at !== undefined) {
    w.low = Math.min(w.low, at);
    return "unknown";
  }
  const depth = w.path.size;
  if (depth >= MAX_DEPTH) {
    w.deep = { q, node };
    w.low = -1;
    return "unknown";
  }
  const outer = w.low;
  w.low = Infinity;
  w.path.set(node, depth);
  const answer = classify(m, q, node, w);
  w.path.delete(node);
  if (w.low >= depth) origins.set(node, answer);
  else w.answers.set(node, answer);
  w.low = Math.min(outer, w.low);
  return answer;
}

function classify(m: MIndex, q: MQuery, node: Node, w: Walk): Origin {
  switch (node.kind) {
    case Kind.LiteralExpression:
    case Kind.Constant:
      return "static";
    case Kind.IdentifierExpression: {
      const r = resolve(m, q, node);
      if (r.kind === "row") return "row";
      if (r.kind === "value") return originOf(m, q, r.node, w);
      if (r.kind === "modelParameter" || r.kind === "library") return "static";
      if (r.kind === "parameter") return "parameter";
      if (r.kind === "query") {
        const body = r.query.ast && unwrap(r.query.ast);
        if (!body || body.kind === Kind.FunctionExpression) return "unknown";
        return originOf(m, r.query, body, w);
      }
      return "unknown";
    }
    case Kind.FieldSelector:
    case Kind.FieldProjection:
      return "row";
    case Kind.LetExpression:
      return originOf(m, q, node.expression, w);
    // Desktop reads any if as dynamic, whatever its branches; the condition adds nothing more.
    case Kind.IfExpression:
      return worst([
        "chosen",
        originOf(m, q, node.trueExpression, w),
        originOf(m, q, node.falseExpression, w),
      ]);
    // An error stops the query, so it reaches no source.
    case Kind.ErrorRaisingExpression:
      return "static";
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
          ...invoke.content.elements.map((csv) => originOf(m, q, csv.node, w)),
        ]);
      }
      // A field or an item: of a record or list written in place, or a name bound to one through
      // variables, queries, and lets' results, it is known.
      let container = unwrap(node.head);
      let cq = q;
      const followed = new Set<Node>();
      for (;;) {
        // A let stands for what its `in` returns.
        if (container.kind === Kind.LetExpression) {
          container = unwrap(container.expression);
          continue;
        }
        if (container.kind !== Kind.IdentifierExpression) break;
        if (followed.has(container)) return "unknown";
        followed.add(container);
        const r = resolve(m, cq, container);
        if (r.kind === "value") container = unwrap(r.node);
        else if (r.kind === "query" && r.query.ast) {
          cq = r.query;
          container = unwrap(r.query.ast);
        } else if (r.kind === "parameter") {
          // A custom function's parameter is dynamic (spec 9.3), and so is any field of it.
          return "parameter";
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
          .map((n) => originOf(m, q, n, w)),
      );
    }
  }
}

const bound = new WeakMap<Node, { node: Node; step?: string }>();

/**
 * What a node stands for through `let` and record bindings: a name bound to a step is followed to
 * the step's value while that value is itself a name, with parentheses and `meta` taken off.
 * `step` is the last name followed, the step whose value `node` is; undefined when `node` is
 * written in place. Model parameters and other queries are not followed. Each name's answer is
 * remembered for the run, except the names of a cycle that ended the walk.
 */
export function boundValue(m: MIndex, q: MQuery, node: Node): { node: Node; step?: string } {
  let n = unwrap(node);
  let step: string | undefined;
  // Each name followed, by its place in `followed`.
  const at = new Map<Node, number>();
  const followed: Node[] = [];
  let cycle = Infinity;
  let answer: { node: Node; step?: string } | undefined;
  while (n.kind === Kind.IdentifierExpression) {
    answer = bound.get(n);
    if (answer) break;
    const i = at.get(n);
    if (i !== undefined) {
      cycle = i;
      break;
    }
    const r = resolve(m, q, n);
    if (r.kind !== "value") break;
    at.set(n, followed.length);
    followed.push(n);
    step = identifierName(n.identifier.literal);
    n = unwrap(r.node);
  }
  answer ??= { node: n, step };
  // Every name followed stands for the same node, through the same last step; a cycle's own names
  // stop at a different place in it, and are not remembered.
  for (const f of followed.slice(0, cycle)) bound.set(f, answer);
  return answer;
}
