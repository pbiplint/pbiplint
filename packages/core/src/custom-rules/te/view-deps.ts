import { tokenizeDax } from "../../dax/tokenize.js";
import { buildReferenceIndex } from "../../index/references.js";
import type { Column, DaxFunction, Measure, Model, Table } from "../../model/types.js";

/** One reference an expression makes, to a table, a column, a measure, or a function of the model. */
export interface DaxDependency {
  target: Table | Column | Measure | DaxFunction;
  /** Written with its table: `'Sales'[Amount]`, `Sales[Amount]`. A table reference never is. */
  fullyQualified: boolean;
}

/**
 * What each DAX expression in the model reads and, the other way round, what reads each table,
 * column, and measure, as Tabular Editor's `DependsOn` and `ReferencedBy` give them. An owner is
 * the model object whose DAX it is (a measure, calculated column, calculated table, table
 * permission, calculation item, or function), or the KPI part of a measure, by the object
 * `kpiOf` gives for it.
 */
export interface DependencyGraph {
  /** Every reference the owner's DAX makes, in the order written, columns and measures first. */
  dependsOn(owner: object): readonly DaxDependency[];
  /** The owners whose DAX references the target, each once, in model order. */
  referencedBy(target: object): readonly object[];
}

const lower = (s: string): string => s.toLowerCase();

/**
 * Built on pbiplint's reference index (index/references.ts), which resolves column and measure
 * names as the ported rules read them. Two things differ from that index, both as Tabular Editor
 * keeps them: a measure's KPI is its own object, so its expressions are read apart from the
 * measure's, and a table named on its own (`COUNTROWS(Notes)`, `'Sales'` not followed by a column)
 * is a reference to the table. A table name followed by a column is the column's qualifier only.
 */
export function buildDependencyGraph(
  model: Model,
  kpiOf: (m: Measure) => object | undefined,
): DependencyGraph {
  const tables = new Map(model.tables.map((t) => [lower(t.name), t]));
  const functions = new Map(model.functions.map((f) => [lower(f.name), f]));
  const columns = new Map<string, Column>();
  const measures = new Map<string, Measure>();
  for (const t of model.tables) {
    for (const c of t.columns) columns.set(`${lower(t.name)} ${lower(c.name)}`, c);
    for (const m of t.measures) if (!measures.has(lower(m.name))) measures.set(lower(m.name), m);
  }

  // A copy of the model whose measures read only their own DAX, or only their KPI's, with the
  // copies mapped back to the model's objects. Columns and everything else are shared.
  const original = new Map<object, object>();
  const copyWith = (measureDax: (m: Measure) => Measure | undefined): Model => ({
    ...model,
    tables: model.tables.map((t) => {
      const copy: Table = { ...t, measures: [] };
      original.set(copy, t);
      copy.measures = t.measures.map((m) => {
        const c = { ...(measureDax(m) ?? m), table: copy };
        original.set(c, m);
        return c;
      });
      return copy;
    }),
  });

  const deps = new Map<object, DaxDependency[]>();
  const order: object[] = [];

  const read = (copy: Model, ownerOf: (o: object) => object | undefined) => {
    for (const o of buildReferenceIndex(copy).owners) {
      const owner = ownerOf(original.get(o.object) ?? o.object);
      if (owner === undefined) continue;
      const out: DaxDependency[] = [];
      for (const r of o.refs) {
        const target =
          r.kind === "column"
            ? columns.get(`${lower(r.table!)} ${lower(r.name)}`)
            : r.kind === "measure"
              ? measures.get(lower(r.name))
              : undefined;
        if (target) out.push({ target, fullyQualified: r.qualified });
      }
      const tokens = tokenizeDax(o.expression);
      tokens.forEach((t, k) => {
        if (t.kind !== "table" && t.kind !== "identifier") return;
        const next = tokens[k + 1];
        if (next?.kind === "column" && (t.kind === "table" || next.start === t.end)) return;
        if (next?.call !== undefined) {
          // A call of a user-defined function is a reference to it, as Tabular Editor keeps it.
          const called = functions.get(lower(t.text));
          if (called) out.push({ target: called, fullyQualified: false });
          return;
        }
        const table = tables.get(lower(t.text));
        if (table) out.push({ target: table, fullyQualified: false });
      });
      deps.set(owner, out);
      order.push(owner);
    }
  };

  read(
    copyWith((m) => ({ ...m, kpiExpressions: undefined })),
    (o) => o,
  );
  const withKpi = model.tables.flatMap((t) => t.measures).filter((m) => kpiOf(m) !== undefined);
  if (withKpi.length > 0) {
    const kpiMeasures = new Set<object>(withKpi);
    read(
      copyWith((m) =>
        kpiMeasures.has(m)
          ? {
              ...m,
              expression: (m.kpiExpressions ?? []).join("\n"),
              formatStringDefinition: undefined,
              kpiExpressions: undefined,
            }
          : undefined,
      ),
      (o) => (kpiMeasures.has(o) ? kpiOf(o as Measure) : undefined),
    );
  }

  const readers = new Map<object, object[]>();
  for (const owner of order)
    for (const d of deps.get(owner) ?? []) {
      const list = readers.get(d.target) ?? [];
      if (!list.includes(owner)) list.push(owner);
      readers.set(d.target, list);
    }

  return {
    dependsOn: (owner) => deps.get(owner) ?? [],
    referencedBy: (target) => readers.get(target) ?? [],
  };
}
