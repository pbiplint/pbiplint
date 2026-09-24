import { columnRef, isAutoDateTable, measureRef, tableRef } from "../model/names.js";
import type { Column, Measure, Model, Table } from "../model/types.js";
import type { ReferenceIndex, RefOwner, RefOwnerKind } from "./references.js";
import type { ReportReferenceIndex } from "./report-refs.js";

type Node = Table | Column | Measure;

export interface ReachabilityIndex {
  reached(object: Node): boolean;
  /** Names from a root to the object, root first; empty when unreached. */
  pathTo(object: Node): string[];
  /**
   * Unreached objects in model order; a table is listed when every column and measure on it is
   * unreached. Desktop's auto date/time tables are left out whether reached or not: Desktop
   * manages them, so there is nothing to delete, and REMOVE_AUTO-DATE_TABLE reports them.
   * `reached` and `pathTo` still answer truthfully for their columns.
   */
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
 * report reference (a hierarchy's level columns, and the date column a variation reference goes
 * through), both columns of every relationship except one to an auto date/time table, columns
 * named in RLS and OLS, variation default columns, every column with an `alternateOf` mapping (an
 * aggregation table's), and the references of the report's own measures. From a reached object: a
 * measure reaches what its DAX references; a calculated column likewise; a column reaches its
 * table, its sort-by column, the columns it groups by (a field parameter's hidden Fields column),
 * the base column or table its `alternateOf` mapping names, and, on a calculated table, the
 * table's expression references; a calculation group table reaches its items' references. The
 * path kept for each object is the shortest, so a finding's detail can say what reached it or why
 * nothing did.
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
    // A field read through a date column's variation uses that column too.
    if ("variationOf" in res) reach(res.variationOf, null);
  }
  // A relationship to one of Desktop's auto date/time tables is Desktop's, added for the date
  // column's hierarchy, not a use of the date column, so it roots neither end.
  const autoDate = (table: string): boolean => {
    const t = tables.get(table.toLowerCase());
    return t !== undefined && isAutoDateTable(t);
  };
  for (const rel of model.relationships) {
    if (autoDate(rel.fromTable) || autoDate(rel.toTable)) continue;
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
  // An aggregation table's columns: report queries name the detail table, and Power BI answers
  // them from the aggregation table where it can, so no report names these columns. The walk is
  // breadth-first and keeps the first path it finds, so of two paths of the same length the one
  // from the earlier root wins. Rooted last, a mapped base column keeps the report's path when
  // the report names it or reaches it in one step, as a measure's DAX reaches a column, and the
  // mapping's path when the report's is longer.
  for (const t of model.tables) for (const c of t.columns) if (c.alternateOf) reach(c, null);

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
    for (const g of n.groupByColumns) reach(columnOf(n.table.name, g), n);
    // The detail column an aggregation column maps to, or the table whose rows it counts.
    const base = n.alternateOf;
    if (base?.baseColumn) reach(columnOf(base.baseTable ?? "", base.baseColumn), n);
    else if (base?.baseTable) reach(tables.get(base.baseTable.toLowerCase()), n);
  }

  // A reference owner is not always something a reason can name: a table permission's object is a
  // TablePermission and a calculation item's is a CalculationItem, neither of which carries a table
  // object, and a calculated table's is the table rather than a column or a measure. Only these two
  // owner kinds hold one, so the reason names those and passes over the rest.
  const NAMEABLE: ReadonlySet<RefOwnerKind> = new Set(["measure", "calculatedColumn"]);
  const daxReferrers = (owners: readonly RefOwner[]): Node[] =>
    owners.filter((o) => NAMEABLE.has(o.kind)).map((o) => o.object as Column | Measure);
  // The v1 reference index records DAX references only, so a column a sibling sorts or groups by
  // has no DAX referrer at all. The walk follows those edges, so the reason has to read them too.
  const referrersOf = (n: Column | Measure): Node[] => {
    if (isMeasure(n)) return daxReferrers(references.measureReferencedBy(n));
    const dax = daxReferrers(references.columnReferencedBy(n));
    const same = (name: string): boolean => name.toLowerCase() === n.name.toLowerCase();
    const siblings = n.table.columns.filter(
      (c) => (c.sortByColumn !== undefined && same(c.sortByColumn)) || c.groupByColumns.some(same),
    );
    return [...dax, ...siblings.filter((c) => !dax.includes(c))];
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
      const listed = model.tables.filter((t) => !isAutoDateTable(t));
      const columns = listed.flatMap((t) => t.columns.filter((c) => !parent.has(c)));
      const measures = listed.flatMap((t) => t.measures.filter((m) => !parent.has(m)));
      const tables = listed.filter(
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
