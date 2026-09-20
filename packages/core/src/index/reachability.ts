import { columnRef, measureRef, tableRef } from "../model/names.js";
import type { Column, Measure, Model, Table } from "../model/types.js";
import type { ReferenceIndex, RefOwner, RefOwnerKind } from "./references.js";
import type { ReportReferenceIndex } from "./report-refs.js";

type Node = Table | Column | Measure;

export interface ReachabilityIndex {
  reached(object: Node): boolean;
  /** Names from a root to the object, root first; empty when unreached. */
  pathTo(object: Node): string[];
  /** Unreached objects in model order; a table is listed when every column and measure on it is unreached. */
  unreached(): { tables: Table[]; columns: Column[]; measures: Measure[] };
  /** Why an unreached column or measure is unreached, as the finding's detail. */
  reasonFor(object: Column | Measure): string;
}

const isTable = (n: Node): n is Table => "columns" in n;
const isMeasure = (n: Node): n is Measure => "expression" in n && !("kind" in n);
const nameOf = (n: Node): string =>
  isTable(n)
    ? tableRef(n.name)
    : isMeasure(n)
      ? measureRef(n.name)
      : columnRef(n.table.name, n.name);

/**
 * What the report reaches in the model, to a fixed point (spec section 6). Roots: every resolved
 * report reference, both columns of every relationship, columns named in RLS and OLS, variation
 * default columns, and the references of the report's own measures. From a reached object: a
 * measure reaches what its DAX references; a calculated column likewise; a column reaches its
 * table, its sort-by column, and, on a calculated table, the table's expression references; a
 * calculation group table reaches its items' references. The path kept for each object is the
 * shortest, so a finding's detail can say what reached it or why nothing did.
 */
export function buildReachabilityIndex(
  model: Model,
  references: ReferenceIndex,
  reportRefs: ReportReferenceIndex,
): ReachabilityIndex {
  const tables = new Map(model.tables.map((t) => [t.name.toLowerCase(), t]));
  const columnOf = (table: string, name: string): Column | undefined =>
    tables
      .get(table.toLowerCase())
      ?.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const measureOf = (table: string, name: string): Measure | undefined =>
    tables
      .get(table.toLowerCase())
      ?.measures.find((m) => m.name.toLowerCase() === name.toLowerCase());
  const parent = new Map<Node, Node | null>();
  const queue: Node[] = [];
  const reach = (n: Node | undefined, from: Node | null): void => {
    if (!n || parent.has(n)) return;
    parent.set(n, from);
    queue.push(n);
  };
  const reachDax = (owner: object, from: Node): void => {
    for (const r of references.refsOf(owner)) {
      if (r.kind === "column") reach(columnOf(r.table!, r.name), from);
      else if (r.kind === "measure") reach(measureOf(r.table!, r.name), from);
    }
  };

  for (const r of reportRefs.refs) {
    const res = r.resolution;
    if (res.kind === "column") reach(res.column, null);
    else if (res.kind === "measure") reach(res.measure, null);
    else if (res.kind === "hierarchy")
      for (const level of res.level ? [res.level] : res.hierarchy.levels)
        if (level.column !== undefined)
          reach(columnOf(res.hierarchy.table.name, level.column), null);
  }
  for (const rel of model.relationships) {
    reach(columnOf(rel.fromTable, rel.fromColumn), null);
    reach(columnOf(rel.toTable, rel.toColumn), null);
  }
  for (const role of model.roles)
    for (const tp of role.tablePermissions) {
      for (const r of references.refsOf(tp))
        if (r.kind === "column") reach(columnOf(r.table!, r.name), null);
      for (const cp of tp.columnPermissions) reach(columnOf(tp.table, cp.column), null);
    }
  for (const t of model.tables)
    for (const c of t.columns)
      for (const v of c.variations)
        if (v.defaultColumn) reach(columnOf(v.defaultColumn.table, v.defaultColumn.column), null);

  while (queue.length) {
    const n = queue.shift()!;
    if (isTable(n)) {
      if (n.kind === "calculated") reachDax(n, n);
      for (const item of n.calculationGroup?.items ?? []) reachDax(item, n);
      continue;
    }
    if (isMeasure(n)) {
      reach(n.table, n);
      reachDax(n, n);
      continue;
    }
    reach(n.table, n);
    if (n.kind === "calculated") reachDax(n, n);
    if (n.sortByColumn !== undefined) reach(columnOf(n.table.name, n.sortByColumn), n);
  }

  // A reference owner is not always something a reason can name: a table permission's object is a
  // TablePermission and a calculation item's is a CalculationItem, neither of which carries a table
  // object, and a calculated table's is the table rather than a column or a measure. Only these two
  // owner kinds hold one, so the reason names those and passes over the rest.
  const NAMEABLE: ReadonlySet<RefOwnerKind> = new Set(["measure", "calculatedColumn"]);
  const daxReferrers = (owners: readonly RefOwner[]): Node[] =>
    owners.filter((o) => NAMEABLE.has(o.kind)).map((o) => o.object as Column | Measure);
  // The v1 reference index records DAX references only, so a column a sibling sorts by has no DAX
  // referrer at all. The walk follows that sort-by edge, so the reason has to read through it too.
  const referrersOf = (n: Column | Measure): Node[] => {
    if (isMeasure(n)) return daxReferrers(references.measureReferencedBy(n));
    const dax = daxReferrers(references.columnReferencedBy(n));
    const sortedBy = n.table.columns.filter(
      (c) => c.sortByColumn !== undefined && c.sortByColumn.toLowerCase() === n.name.toLowerCase(),
    );
    return [...dax, ...sortedBy.filter((c) => !dax.includes(c))];
  };
  return {
    reached: (n) => parent.has(n),
    pathTo: (n) => {
      if (!parent.has(n)) return [];
      const path: string[] = [];
      for (let cur: Node | null = n; cur; cur = parent.get(cur) ?? null) path.unshift(nameOf(cur));
      return path;
    },
    unreached: () => {
      const columns = model.tables.flatMap((t) => t.columns.filter((c) => !parent.has(c)));
      const measures = model.tables.flatMap((t) => t.measures.filter((m) => !parent.has(m)));
      const tables = model.tables.filter(
        (t) => (t.columns.length > 0 || t.measures.length > 0) && !parent.has(t),
      );
      return { tables, columns, measures };
    },
    reasonFor: (n) => {
      const referrers = referrersOf(n).filter((r) => r !== n);
      if (referrers.length === 0)
        return "nothing in the report reaches it, and no measure or column references it";
      return `referenced only by ${referrers.map(nameOf).join(", ")}, which nothing reaches either`;
    },
  };
}
