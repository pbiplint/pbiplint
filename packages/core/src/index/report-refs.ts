import type { Column, Hierarchy, Level, Measure, Model, Table } from "../model/types.js";
import type { Bookmark, FieldRef, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import { extractRefs } from "./references.js";

export type ReportRefOwnerKind =
  | "visualField"
  | "visualFilter"
  | "pageFilter"
  | "pageBinding"
  | "reportFilter"
  | "bookmark"
  | "reportMeasure";

export interface ReportRefOwner {
  kind: ReportRefOwnerKind;
  object: Visual | Page | Report | Bookmark | ReportMeasure;
  /** The visual role for a `visualField` owner. */
  role?: string;
}

export type Resolution =
  | { kind: "column"; column: Column }
  | { kind: "measure"; measure: Measure }
  | { kind: "reportMeasure"; measure: ReportMeasure }
  | { kind: "hierarchy"; hierarchy: Hierarchy; level?: Level }
  | { kind: "unresolved"; reason: string };

export interface ReportRef {
  ref: FieldRef;
  owner: ReportRefOwner;
  file: string;
  resolution: Resolution;
}

export interface ReportReferenceIndex {
  refs: ReportRef[];
  /** Report references that resolve to this model column or measure. */
  referencedBy(target: Column | Measure): ReportRef[];
  unresolved(): ReportRef[];
  /** The references a visual's roles bind, in role order. */
  fieldsOf(v: Visual): ReportRef[];
}

const lower = (s: string): string => s.toLowerCase();
const q = (s: string): string => `"${s}"`;

/**
 * Every field reference in the report with what it resolves to. Resolution is by name without
 * regard to case, the way the model's own reference index resolves DAX. A measure is looked up on
 * the table the reference names, then among the report's own measures, and a measure that lives
 * on another table is reported as such, since Desktop breaks the visual the same way when a
 * measure moves. Without a model, everything but a report measure is unresolved with one reason.
 */
export function buildReportReferenceIndex(
  report: Report,
  model: Model | undefined,
): ReportReferenceIndex {
  const tables = new Map<string, Table>((model?.tables ?? []).map((t) => [lower(t.name), t]));
  const measuresByName = new Map<string, Measure>();
  for (const t of model?.tables ?? [])
    for (const m of t.measures) measuresByName.set(lower(m.name), m);
  const reportMeasures = new Map<string, ReportMeasure>(
    report.measures.map((m) => [`${lower(m.table)}\u0000${lower(m.name)}`, m]),
  );
  const reportMeasuresByName = new Map<string, ReportMeasure>(
    report.measures.map((m) => [lower(m.name), m]),
  );
  const columnOf = (t: Table, name: string): Column | undefined =>
    t.columns.find((c) => lower(c.name) === lower(name));
  const measureOf = (t: Table, name: string): Measure | undefined =>
    t.measures.find((m) => lower(m.name) === lower(name));

  const resolve = (ref: FieldRef): Resolution => {
    const extension = reportMeasures.get(`${lower(ref.table)}\u0000${lower(ref.name)}`);
    if (ref.kind === "measure" && extension) return { kind: "reportMeasure", measure: extension };
    if (!model) return { kind: "unresolved", reason: "no model in the input" };
    if (ref.table === "")
      return { kind: "unresolved", reason: "a filter alias that no From list declares" };
    const t = tables.get(lower(ref.table));
    if (!t) return { kind: "unresolved", reason: `no table named ${q(ref.table)}` };
    if (ref.kind === "column" || ref.kind === "aggregation") {
      const c = columnOf(t, ref.name);
      if (c) return { kind: "column", column: c };
      if (measureOf(t, ref.name))
        return {
          kind: "unresolved",
          reason: `${q(ref.name)} is a measure on ${q(t.name)}, not a column`,
        };
      return { kind: "unresolved", reason: `no column named ${q(ref.name)} on ${q(t.name)}` };
    }
    if (ref.kind === "measure") {
      const m = measureOf(t, ref.name);
      if (m) return { kind: "measure", measure: m };
      const elsewhere = measuresByName.get(lower(ref.name));
      if (elsewhere)
        return {
          kind: "unresolved",
          reason: `[${elsewhere.name}] is on ${q(elsewhere.table.name)}, not ${q(t.name)}`,
        };
      return { kind: "unresolved", reason: `no measure named ${q(ref.name)} on ${q(t.name)}` };
    }
    const h = t.hierarchies.find((x) => lower(x.name) === lower(ref.name));
    if (!h)
      return { kind: "unresolved", reason: `no hierarchy named ${q(ref.name)} on ${q(t.name)}` };
    if (ref.level === undefined) return { kind: "hierarchy", hierarchy: h };
    const level = h.levels.find((l) => lower(l.name) === lower(ref.level!));
    if (!level)
      return {
        kind: "unresolved",
        reason: `no level named ${q(ref.level)} in hierarchy ${q(h.name)} on ${q(t.name)}`,
      };
    return { kind: "hierarchy", hierarchy: h, level };
  };

  const refs: ReportRef[] = [];
  const add = (owner: ReportRefOwner, file: string, list: FieldRef[]): void => {
    for (const ref of list) refs.push({ ref, owner, file, resolution: resolve(ref) });
  };
  add(
    { kind: "reportFilter", object: report },
    report.file ?? "definition/report.json",
    report.filters.flatMap((f) => f.refs),
  );
  for (const page of report.pages) {
    add(
      { kind: "pageFilter", object: page },
      page.file,
      page.filters.flatMap((f) => f.refs),
    );
    add({ kind: "pageBinding", object: page }, page.file, page.bindingRefs);
    for (const v of page.visuals) {
      for (const field of v.fields)
        add({ kind: "visualField", object: v, role: field.role }, v.file, [field.ref]);
      add(
        { kind: "visualFilter", object: v },
        v.file,
        v.filters.flatMap((f) => f.refs),
      );
    }
  }
  for (const b of report.bookmarks) add({ kind: "bookmark", object: b }, b.file, b.refs);
  // A report measure's DAX is read the way a model measure's is: a bare [X] is a measure anywhere
  // in the model or the report, else a column on the measure's own table.
  for (const m of report.measures) {
    const owner: ReportRefOwner = { kind: "reportMeasure", object: m };
    for (const raw of extractRefs(m.expression)) {
      if (raw.qualified) {
        const t = tables.get(lower(raw.table!));
        const kind = t && measureOf(t, raw.name) ? "measure" : "column";
        add(owner, m.file, [{ kind, table: raw.table!, name: raw.name, pointer: "" }]);
        continue;
      }
      const modelMeasure = measuresByName.get(lower(raw.name));
      const extension = reportMeasuresByName.get(lower(raw.name));
      if (modelMeasure)
        add(owner, m.file, [
          { kind: "measure", table: modelMeasure.table.name, name: modelMeasure.name, pointer: "" },
        ]);
      else if (extension)
        add(owner, m.file, [
          { kind: "measure", table: extension.table, name: extension.name, pointer: "" },
        ]);
      else {
        const own = tables.get(lower(m.table));
        if (own && columnOf(own, raw.name))
          add(owner, m.file, [{ kind: "column", table: own.name, name: raw.name, pointer: "" }]);
        else
          refs.push({
            ref: { kind: "measure", table: m.table, name: raw.name, pointer: "" },
            owner,
            file: m.file,
            resolution: { kind: "unresolved", reason: `no measure or column named ${q(raw.name)}` },
          });
      }
    }
  }

  const byTarget = new Map<object, ReportRef[]>();
  for (const r of refs) {
    const target =
      r.resolution.kind === "column"
        ? r.resolution.column
        : r.resolution.kind === "measure"
          ? r.resolution.measure
          : undefined;
    if (!target) continue;
    const arr = byTarget.get(target) ?? [];
    arr.push(r);
    byTarget.set(target, arr);
  }
  return {
    refs,
    referencedBy: (target) => byTarget.get(target) ?? [],
    unresolved: () => refs.filter((r) => r.resolution.kind === "unresolved"),
    fieldsOf: (v) => refs.filter((r) => r.owner.kind === "visualField" && r.owner.object === v),
  };
}
