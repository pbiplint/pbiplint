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
 * reaches no source. A cycle reads as unknown, and every value in it has one answer: the worst of
 * the cycle's own parts, what they reach, and unknown.
 */
export function origin(m: MIndex, q: MQuery, node: Node): Origin {
  const known = origins.get(node);
  if (known) return known;
  // Tarjan's strongly connected components, with a stack of frames instead of recursion, so no
  // chain is too long to follow: each node's own class and the nodes it reaches, a cycle's nodes
  // answered together once all are seen.
  const order = new Map<Node, number>();
  const low = new Map<Node, number>();
  const own = new Map<Node, Origin>();
  const open: Node[] = [];
  const frames: { node: Node; next: Reached[]; i: number }[] = [];
  // Nodes that reach themselves directly.
  const loops = new Set<Node>();
  const enter = (n: Node, nq: MQuery) => {
    const s = step(m, nq, n);
    order.set(n, order.size);
    low.set(n, order.size - 1);
    own.set(n, s.own);
    open.push(n);
    frames.push({ node: n, next: s.next, i: 0 });
  };
  const add = (n: Node, o: Origin) => own.set(n, worst([own.get(n)!, o]));
  enter(node, q);
  while (frames.length) {
    const f = frames[frames.length - 1]!;
    const next = f.next[f.i++];
    if (next) {
      const done = origins.get(next.node);
      if (done) add(f.node, done);
      else if (!order.has(next.node)) enter(next.node, next.q);
      else {
        // Still open: the node is in a cycle with it.
        low.set(f.node, Math.min(low.get(f.node)!, order.get(next.node)!));
        if (next.node === f.node) loops.add(f.node);
      }
      continue;
    }
    frames.pop();
    if (low.get(f.node) === order.get(f.node)) {
      const members = open.splice(open.lastIndexOf(f.node));
      const answer = worst([
        ...members.map((n) => own.get(n)!),
        members.length > 1 || loops.has(f.node) ? "unknown" : "static",
      ]);
      for (const n of members) origins.set(n, answer);
    }
    const parent = frames[frames.length - 1];
    if (parent) {
      const done = origins.get(f.node);
      if (done) add(parent.node, done);
      else low.set(parent.node, Math.min(low.get(parent.node)!, low.get(f.node)!));
    }
  }
  return origins.get(node)!;
}

/**
 * Each node's answer for the run. It depends on the index's other queries, so an `MQuery` must
 * never be shared between two `MIndex`es.
 */
const origins = new WeakMap<Node, Origin>();

/** A node `origin` reads, in the query that holds it. */
interface Reached {
  q: MQuery;
  node: Node;
}

/** A node's own class, and the nodes whose classes it takes the worst of. */
function step(m: MIndex, q: MQuery, node: Node): { own: Origin; next: Reached[] } {
  const leaf = (own: Origin) => ({ own, next: [] });
  const of = (own: Origin, ...nodes: Node[]) => ({ own, next: nodes.map((n) => ({ q, node: n })) });
  switch (node.kind) {
    case Kind.LiteralExpression:
    case Kind.Constant:
      return leaf("static");
    case Kind.IdentifierExpression: {
      const r = resolve(m, q, node);
      if (r.kind === "row") return leaf("row");
      if (r.kind === "value") return of("static", r.node);
      if (r.kind === "modelParameter" || r.kind === "library") return leaf("static");
      if (r.kind === "parameter") return leaf("parameter");
      if (r.kind === "query") {
        const body = r.query.ast && unwrap(r.query.ast);
        if (!body || body.kind === Kind.FunctionExpression) return leaf("unknown");
        return { own: "static", next: [{ q: r.query, node: body }] };
      }
      return leaf("unknown");
    }
    case Kind.FieldSelector:
    case Kind.FieldProjection:
      return leaf("row");
    case Kind.LetExpression:
      return of("static", node.expression);
    // Desktop reads any if as dynamic, whatever its branches; the condition adds nothing more.
    case Kind.IfExpression:
      return of("chosen", node.trueExpression, node.falseExpression);
    // An error stops the query, so it reaches no source.
    case Kind.ErrorRaisingExpression:
      return leaf("static");
    case Kind.FunctionExpression:
    case Kind.EachExpression:
      return leaf("unknown");
    case Kind.RecursivePrimaryExpression: {
      const steps = node.recursiveExpressions.elements;
      const at = steps.findIndex((s) => s.kind === Kind.InvokeExpression);
      const invoke = steps[at];
      if (invoke && invoke.kind === Kind.InvokeExpression) {
        // A field or an item of what a call returns is data the call read.
        const read = steps.slice(at + 1).some((s) => s.kind !== Kind.InvokeExpression);
        return of(read ? "row" : "computed", ...invoke.content.elements.map((csv) => csv.node));
      }
      return leaf(fieldOf(m, q, unwrap(node.head)));
    }
    default:
      return of(
        "static",
        ...(q.nodeIdMapCollection?.childIdsById.get(node.id) ?? [])
          .map((id) => nodeOf(q, id))
          .filter((n): n is Node => n !== undefined),
      );
  }
}

/** Each name's answer as `fieldOf` reads it, for the run. */
const fields = new WeakMap<Node, Origin>();

/**
 * A field or an item of `head`: of a record or list written in place, or a name bound to one through
 * variables, queries, and lets' results, it is known (`unknown`); of a custom function's parameter
 * it is `parameter`; of anything else, `row`. A cycle is unknown.
 */
function fieldOf(m: MIndex, q: MQuery, head: Node): Origin {
  let container = head;
  let cq = q;
  const followed = new Set<Node>();
  let answer: Origin | undefined;
  for (;;) {
    // A let stands for what its `in` returns.
    if (container.kind === Kind.LetExpression) {
      container = unwrap(container.expression);
      continue;
    }
    if (container.kind !== Kind.IdentifierExpression) break;
    answer = fields.get(container) ?? (followed.has(container) ? "unknown" : undefined);
    if (answer) break;
    followed.add(container);
    const r = resolve(m, cq, container);
    if (r.kind === "value") container = unwrap(r.node);
    else if (r.kind === "query" && r.query.ast) {
      cq = r.query;
      container = unwrap(r.query.ast);
    } else if (r.kind === "parameter") {
      // A custom function's parameter is dynamic (spec 9.3), and so is any field of it.
      answer = "parameter";
      break;
    } else break;
  }
  answer ??= isLiteralContainer(container) ? "unknown" : "row";
  // Every name followed reaches the same end, or the same cycle.
  for (const n of followed) fields.set(n, answer);
  return answer;
}

const bound = new WeakMap<Node, { node: Node; step?: string }>();

/**
 * What a node stands for through `let` and record bindings: a name bound to a step is followed to
 * the step's value while that value is itself a name, with parentheses and `meta` taken off.
 * `step` is the last name followed, the step whose value `node` is; undefined when `node` is
 * written in place. Model parameters and other queries are not followed. Each name's answer is
 * remembered for the run.
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
  // Every name followed stands for the same node, through the same last step, but a cycle's own
  // names: each stops at itself, the value of the name before it in the cycle.
  followed.forEach((f, i) => {
    const before =
      i > cycle ? followed[i - 1] : i === cycle ? followed[followed.length - 1] : undefined;
    bound.set(
      f,
      before?.kind === Kind.IdentifierExpression
        ? { node: f, step: identifierName(before.identifier.literal) }
        : answer,
    );
  });
  return answer;
}
