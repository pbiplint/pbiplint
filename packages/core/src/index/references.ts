import type {
  CalculationItem,
  Column,
  Measure,
  Model,
  Table,
  TablePermission,
} from "../model/types.js";

export type RefOwnerKind =
  "measure" | "calculatedColumn" | "calculatedTable" | "tablePermission" | "calculationItem";

export interface DaxRef {
  kind: "column" | "measure" | "unresolved";
  /** Canonical table name of the resolved object. */
  table?: string;
  /** Canonical name of the resolved object, or the raw name when unresolved. */
  name: string;
  qualified: boolean;
}

export interface RefOwner {
  kind: RefOwnerKind;
  object: Measure | Column | Table | TablePermission | CalculationItem;
  ownerTable?: Table;
  expression: string;
  refs: DaxRef[];
}

export interface ReferenceIndex {
  owners: RefOwner[];
  refsOf(object: object): DaxRef[];
  columnReferencedBy(c: Column): RefOwner[];
  measureReferencedBy(m: Measure): RefOwner[];
}

interface RawRef {
  table?: string;
  name: string;
  qualified: boolean;
}

// Qualified: 'Table Name'[Column] or TableName[Column]. Bare: [Name].
const QUALIFIED = /(?:'((?:[^']|'')+)'\s*|([A-Za-z_]\w*))\[([^\]]+)\]/g;
const BARE = /\[([^\]]+)\]/g;

/**
 * Regex approximation of DAX dependencies: qualified refs first, then bare refs whose `[` was not
 * part of a qualified match. Strings and comments are not skipped; that is the upgrade path if a
 * fixture ever breaks parity because of it.
 */
export function extractRefs(expression: string): RawRef[] {
  const out: RawRef[] = [];
  const consumed = new Set<number>();
  for (const m of expression.matchAll(QUALIFIED)) {
    const table = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]!;
    out.push({ table, name: m[3]!, qualified: true });
    consumed.add(m.index! + m[0].length - m[3]!.length - 2);
  }
  for (const m of expression.matchAll(BARE)) {
    if (consumed.has(m.index!)) continue;
    out.push({ name: m[1]!, qualified: false });
  }
  return out;
}

const lower = (s: string): string => s.toLowerCase();
const key = (table: string, name: string): string => `${lower(table)} ${lower(name)}`;

export function buildReferenceIndex(model: Model): ReferenceIndex {
  const tables = new Map<string, Table>(model.tables.map((t) => [lower(t.name), t]));
  const columns = new Map<string, Column>();
  const measures = new Map<string, Measure>();
  for (const t of model.tables) {
    for (const c of t.columns) columns.set(key(t.name, c.name), c);
    for (const m of t.measures) measures.set(lower(m.name), m);
  }
  const columnOf = (t: Table, name: string): Column | undefined => columns.get(key(t.name, name));

  const resolve = (raw: RawRef, ownerTable: Table | undefined, ownerKind: RefOwnerKind): DaxRef => {
    if (raw.qualified) {
      const t = tables.get(lower(raw.table!));
      if (!t) return { kind: "unresolved", table: raw.table, name: raw.name, qualified: true };
      const col = columnOf(t, raw.name);
      if (col) return { kind: "column", table: t.name, name: col.name, qualified: true };
      const meas = t.measures.find((m) => lower(m.name) === lower(raw.name));
      if (meas) return { kind: "measure", table: t.name, name: meas.name, qualified: true };
      return { kind: "unresolved", table: raw.table, name: raw.name, qualified: true };
    }
    const meas = measures.get(lower(raw.name));
    if (meas) return { kind: "measure", table: meas.table.name, name: meas.name, qualified: false };
    if (ownerKind === "calculationItem")
      return { kind: "unresolved", name: raw.name, qualified: false };
    if (ownerTable) {
      const col = columnOf(ownerTable, raw.name);
      if (col) return { kind: "column", table: ownerTable.name, name: col.name, qualified: false };
    }
    for (const t of model.tables) {
      const col = columnOf(t, raw.name);
      if (col) return { kind: "column", table: t.name, name: col.name, qualified: false };
    }
    return { kind: "unresolved", name: raw.name, qualified: false };
  };

  const owners: RefOwner[] = [];
  const byObject = new Map<object, RefOwner>();
  const add = (
    kind: RefOwnerKind,
    object: RefOwner["object"],
    ownerTable: Table | undefined,
    ...expressions: (string | undefined)[]
  ) => {
    const expression = expressions.filter((e): e is string => e !== undefined).join("\n");
    const owner: RefOwner = {
      kind,
      object,
      ownerTable,
      expression,
      refs: extractRefs(expression).map((r) => resolve(r, ownerTable, kind)),
    };
    owners.push(owner);
    byObject.set(object, owner);
  };
  for (const t of model.tables) {
    for (const m of t.measures) add("measure", m, t, m.expression, m.formatStringDefinition);
    for (const c of t.columns)
      if (c.kind === "calculated") add("calculatedColumn", c, t, c.expression);
    if (t.kind === "calculated")
      add(
        "calculatedTable",
        t,
        t,
        ...t.partitions.filter((p) => p.sourceType === "calculated").map((p) => p.source),
      );
    for (const item of t.calculationGroup?.items ?? [])
      add("calculationItem", item, t, item.expression, item.formatStringDefinition);
  }
  for (const role of model.roles) {
    for (const tp of role.tablePermissions)
      if (tp.filter !== undefined)
        add("tablePermission", tp, tables.get(lower(tp.table)), tp.filter);
  }

  const columnRefs = new Map<string, RefOwner[]>();
  const measureRefs = new Map<string, RefOwner[]>();
  for (const o of owners) {
    for (const r of o.refs) {
      if (r.kind === "column") {
        const k = key(r.table!, r.name);
        const arr = columnRefs.get(k) ?? [];
        if (!arr.includes(o)) arr.push(o);
        columnRefs.set(k, arr);
      } else if (r.kind === "measure") {
        const k = lower(r.name);
        const arr = measureRefs.get(k) ?? [];
        if (!arr.includes(o)) arr.push(o);
        measureRefs.set(k, arr);
      }
    }
  }

  return {
    owners,
    refsOf: (object) => byObject.get(object)?.refs ?? [],
    columnReferencedBy: (c) => columnRefs.get(key(c.table.name, c.name)) ?? [],
    measureReferencedBy: (m) => measureRefs.get(lower(m.name)) ?? [],
  };
}
