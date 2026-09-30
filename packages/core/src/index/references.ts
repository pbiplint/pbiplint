import type {
  CalculationItem,
  Column,
  DaxFunction,
  Measure,
  Model,
  Table,
  TablePermission,
} from "../model/types.js";
import { isPunctuation, tokenizeDax, type DaxToken } from "../dax/tokenize.js";

/** An object whose DAX the index reads, with its kind, so `object` narrows with `kind`. */
export type DaxOwner =
  | { kind: "measure"; object: Measure }
  | { kind: "calculatedColumn"; object: Column }
  | { kind: "calculatedTable"; object: Table }
  | { kind: "tablePermission"; object: TablePermission }
  | { kind: "calculationItem"; object: CalculationItem }
  | { kind: "function"; object: DaxFunction };

export type RefOwnerKind = DaxOwner["kind"];

export interface DaxRef {
  kind: "column" | "measure" | "unresolved";
  /** Canonical table name of the resolved object. */
  table?: string;
  /** Canonical name of the resolved object, or the raw name when unresolved. */
  name: string;
  qualified: boolean;
}

export type RefOwner = DaxOwner & {
  ownerTable?: Table;
  expression: string;
  refs: DaxRef[];
  /** The model's user-defined functions the expression calls, each once, in model order. */
  calls: DaxFunction[];
};

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

/**
 * The column and measure references among a DAX expression's tokens, in the order they appear. A
 * `[name]` right after a `'table'` name, or right after an unquoted name with nothing between them
 * (`Sales[Amount]`), is qualified; any other `[name]` is bare. A string is one token and a comment
 * none, so a name written inside either is not a reference. In extended column syntax,
 * `'Date'[Date].[Year]`, the name after the dot is a column of the date column's variation, which
 * nothing here resolves, so only `'Date'[Date]` is read.
 */
export function refsInTokens(tokens: readonly DaxToken[]): RawRef[] {
  const out: RawRef[] = [];
  tokens.forEach((t, k) => {
    if (t.kind !== "column") return;
    const before = tokens[k - 1];
    if (isPunctuation(before, ".") && tokens[k - 2]?.kind === "column") return;
    if (before?.kind === "table" || (before?.kind === "identifier" && before.end === t.start))
      out.push({ table: before.text, name: t.text, qualified: true });
    else out.push({ name: t.text, qualified: false });
  });
  return out;
}

/** The column and measure references in a DAX expression, read from its tokens (`refsInTokens`). */
export function extractRefs(expression: string): RawRef[] {
  return refsInTokens(tokenizeDax(expression));
}

const lower = (s: string): string => s.toLowerCase();
const key = (table: string, name: string): string => `${lower(table)} ${lower(name)}`;

/**
 * A reader of the calls among a DAX expression's tokens to the given user-defined functions, which
 * returns each function called once, in the order given. A call is a name followed by an opening
 * parenthesis, compared without regard to letter case as DAX compares it. The tokenizer reads a
 * name whole, dots included, so `MySales.Total(` and `Other.Sales.Total(` are not calls to
 * `Sales.Total`, and a call written inside a string or a comment is not a call.
 */
export function functionCallReader(
  functions: readonly DaxFunction[],
): (tokens: readonly DaxToken[]) => DaxFunction[] {
  if (functions.length === 0) return () => [];
  const byName = new Map<string, DaxFunction>();
  for (const f of functions) if (!byName.has(lower(f.name))) byName.set(lower(f.name), f);
  const order = new Map(functions.map((f, i) => [f, i]));
  return (tokens) => {
    const found = new Set<DaxFunction>();
    tokens.forEach((t, k) => {
      // `call` is set on a `(` right after a name; the name's own text keeps its letter case.
      const f = t.call === undefined ? undefined : byName.get(lower(tokens[k - 1]!.text));
      if (f) found.add(f);
    });
    return [...found].sort((a, b) => order.get(a)! - order.get(b)!);
  };
}

/** What a bare `[Name]` reads: a measure, the model columns it may name, or nothing. */
export type BareName<M> =
  { kind: "measure"; measure: M } | { kind: "columns"; columns: Column[] } | { kind: "none" };

/** Where resolveBareName looks: the model's tables, a column by name on one, a measure by name. */
export interface BareNameLookup<M> {
  tables: readonly Table[];
  columnOf(table: Table, name: string): Column | undefined;
  measureNamed(name: string): M | undefined;
}

/**
 * What a bare `[Name]` in DAX reads, by one rule for every kind of DAX, so a model measure and a
 * report measure never read the same text two ways (#59). A measure of that name anywhere comes
 * first. Otherwise a column: on the owner's own table, else on the first other table that has one,
 * in model order, as Tabular Editor resolves it (ground-truth item 3). Neither the table a row
 * context iterates nor a column the expression creates itself (`ADDCOLUMNS(..., "X", ...)`, then
 * `[X]`) is worked out. A function has no table of its own, and its caller can hand it any, so
 * its bare name is every model column so called; Tabular Editor reports some of those columns as
 * unused, a recorded deviation of UNNECESSARY_COLUMNS in tests/expectations/udf-sales.json. A
 * calculation item's bare name is a measure or nothing (ground-truth item 3).
 */
export function resolveBareName<M>(
  name: string,
  owner: { kind: RefOwnerKind | "reportMeasure"; table?: Table | undefined },
  lookup: BareNameLookup<M>,
): BareName<M> {
  const measure = lookup.measureNamed(name);
  if (measure !== undefined) return { kind: "measure", measure };
  if (owner.kind === "calculationItem") return { kind: "none" };
  if (owner.kind === "function") {
    const columns = lookup.tables.flatMap((t) => lookup.columnOf(t, name) ?? []);
    return columns.length > 0 ? { kind: "columns", columns } : { kind: "none" };
  }
  const own = owner.table && lookup.columnOf(owner.table, name);
  if (own) return { kind: "columns", columns: [own] };
  for (const t of lookup.tables) {
    const column = lookup.columnOf(t, name);
    if (column) return { kind: "columns", columns: [column] };
  }
  return { kind: "none" };
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
  const lookup: BareNameLookup<Measure> = {
    tables: model.tables,
    columnOf,
    measureNamed: (name) => measures.get(lower(name)),
  };

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
    const bare = resolveBareName(raw.name, { kind: ownerKind, table: ownerTable }, lookup);
    if (bare.kind === "measure")
      return {
        kind: "measure",
        table: bare.measure.table.name,
        name: bare.measure.name,
        qualified: false,
      };
    if (bare.kind === "columns")
      return bare.columns.map((c) => ({
        kind: "column",
        table: c.table.name,
        name: c.name,
        qualified: false,
      }));
    return { kind: "unresolved", name: raw.name, qualified: false };
  };

  const callsIn = functionCallReader(model.functions);
  const owners: RefOwner[] = [];
  const byObject = new Map<object, RefOwner>();
  const add = (
    of: DaxOwner,
    ownerTable: Table | undefined,
    ...expressions: (string | undefined)[]
  ) => {
    const expression = expressions.filter((e): e is string => e !== undefined).join("\n");
    const tokens = tokenizeDax(expression);
    const owner: RefOwner = {
      ...of,
      ownerTable,
      expression,
      refs: refsInTokens(tokens).flatMap((r) => resolve(r, ownerTable, of.kind)),
      calls: callsIn(tokens),
    };
    owners.push(owner);
    byObject.set(of.object, owner);
  };
  for (const t of model.tables) {
    for (const m of t.measures)
      add({ kind: "measure", object: m }, t, m.expression, m.formatStringDefinition);
    for (const c of t.columns)
      if (c.kind === "calculated") add({ kind: "calculatedColumn", object: c }, t, c.expression);
    if (t.kind === "calculated")
      add(
        { kind: "calculatedTable", object: t },
        t,
        ...t.partitions.filter((p) => p.sourceType === "calculated").map((p) => p.source),
      );
    for (const item of t.calculationGroup?.items ?? [])
      add(
        { kind: "calculationItem", object: item },
        t,
        item.expression,
        item.formatStringDefinition,
      );
  }
  for (const role of model.roles) {
    for (const tp of role.tablePermissions)
      if (tp.filter !== undefined)
        add({ kind: "tablePermission", object: tp }, tables.get(lower(tp.table)), tp.filter);
  }
  // The whole expression, parameter list and body: a parameter's default value, `(p = [m])`, is a
  // real reference, and the list holds no other brackets.
  for (const f of model.functions) add({ kind: "function", object: f }, undefined, f.expression);

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
