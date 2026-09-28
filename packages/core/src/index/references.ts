import type {
  CalculationItem,
  Column,
  DaxFunction,
  Measure,
  Model,
  Table,
  TablePermission,
} from "../model/types.js";

export type RefOwnerKind =
  | "measure"
  | "calculatedColumn"
  | "calculatedTable"
  | "tablePermission"
  | "calculationItem"
  | "function";

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
  object: Measure | Column | Table | TablePermission | CalculationItem | DaxFunction;
  ownerTable?: Table;
  expression: string;
  refs: DaxRef[];
  /** The model's user-defined functions the expression calls, each once, in model order. */
  calls: DaxFunction[];
}

export interface ReferenceIndex {
  owners: RefOwner[];
  refsOf(object: object): DaxRef[];
  columnReferencedBy(c: Column): RefOwner[];
  measureReferencedBy(m: Measure): RefOwner[];
  /** The user-defined functions an owner's expression calls. */
  callsOf(object: object): DaxFunction[];
  /** The owners whose expression calls this function, in model order. */
  functionCalledBy(f: DaxFunction): RefOwner[];
}

interface RawRef {
  table?: string;
  name: string;
  qualified: boolean;
}

// Qualified: 'Table Name'[Column] or TableName[Column]. Bare: [Name]. An unquoted table name may
// contain Unicode letters and digits (Año, Größe), so the identifier branch matches \p{L} and
// \p{N} rather than ASCII word characters.
const QUALIFIED = /(?:'((?:[^']|'')+)'\s*|([\p{L}_][\p{L}\p{N}_]*))\[([^\]]+)\]/gu;
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
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A reader of the calls a DAX expression makes to the given user-defined functions, which returns
 * each function called once, in the order given. A call is the function's name, in any letter case
 * as DAX allows, followed by an opening parenthesis, with no letter, digit, underscore, or dot just
 * before the name, so `MySales.Total(` and `Other.Sales.Total(` are not calls to `Sales.Total`.
 * Like the references, a call inside a string or a comment counts.
 */
export function functionCallReader(
  functions: readonly DaxFunction[],
): (expression: string) => DaxFunction[] {
  if (functions.length === 0) return () => [];
  const byName = new Map<string, DaxFunction>();
  for (const f of functions) if (!byName.has(lower(f.name))) byName.set(lower(f.name), f);
  // The character before the name is matched rather than looked behind, and the parenthesis is
  // looked ahead, so a call in another call's arguments, `F(G(`, is found too.
  const call = new RegExp(
    `(^|[^\\p{L}\\p{N}_.])(${[...byName.keys()].map(escapeRegExp).join("|")})(?=\\s*\\()`,
    "giu",
  );
  const order = new Map(functions.map((f, i) => [f, i]));
  return (expression) => {
    const found = new Set<DaxFunction>();
    for (const m of expression.matchAll(call)) {
      const f = byName.get(lower(m[2]!));
      if (f) found.add(f);
    }
    return [...found].sort((a, b) => order.get(a)! - order.get(b)!);
  };
}

export function buildReferenceIndex(model: Model): ReferenceIndex {
  const tables = new Map<string, Table>(model.tables.map((t) => [lower(t.name), t]));
  const columns = new Map<string, Column>();
  const measures = new Map<string, Measure>();
  for (const t of model.tables) {
    for (const c of t.columns) columns.set(key(t.name, c.name), c);
    for (const m of t.measures) measures.set(lower(m.name), m);
  }
  const columnOf = (t: Table, name: string): Column | undefined => columns.get(key(t.name, name));

  const resolve = (
    raw: RawRef,
    ownerTable: Table | undefined,
    ownerKind: RefOwnerKind,
  ): DaxRef | DaxRef[] => {
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
    // A function has no table of its own, and its caller can hand it any table, so a bare name
    // that is no measure is a use of every model column with that name. Tabular Editor reports some
    // of those columns as unused: a recorded deviation of UNNECESSARY_COLUMNS, in
    // tests/expectations/udf-sales.json.
    if (ownerKind === "function") {
      const all = model.tables.flatMap((t): DaxRef[] => {
        const col = columnOf(t, raw.name);
        return col ? [{ kind: "column", table: t.name, name: col.name, qualified: false }] : [];
      });
      return all.length > 0 ? all : { kind: "unresolved", name: raw.name, qualified: false };
    }
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

  const callsIn = functionCallReader(model.functions);
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
      refs: extractRefs(expression).flatMap((r) => resolve(r, ownerTable, kind)),
      calls: callsIn(expression),
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
  // The whole expression, parameter list and body: a parameter's default value, `(p = [m])`, is a
  // real reference, and the list holds no other brackets.
  for (const f of model.functions) add("function", f, undefined, f.expression);

  const columnRefs = new Map<string, RefOwner[]>();
  const measureRefs = new Map<string, RefOwner[]>();
  const callers = new Map<DaxFunction, RefOwner[]>();
  for (const o of owners) {
    for (const f of o.calls) callers.set(f, [...(callers.get(f) ?? []), o]);
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
    callsOf: (object) => byObject.get(object)?.calls ?? [],
    functionCalledBy: (f) => callers.get(f) ?? [],
  };
}
