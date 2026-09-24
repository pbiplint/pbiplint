import { splitQualifiedName } from "../model/build.js";
import type { Column, Hierarchy, Level, Measure, Model, Table } from "../model/types.js";
import type { Bookmark, FieldRef, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import { extractRefs } from "./references.js";

/**
 * What holds a report reference: a visual's role binding, a visual's filter, any other property of
 * a visual (formatting, a bound title, sort), a page's filter or binding, the report filter, a
 * bookmark, or a report measure's DAX. Discriminated on `kind` so `object` narrows with it.
 */
export type ReportRefOwner =
  | {
      kind: "visualField";
      object: Visual;
      /** The visual role the field is bound to. */
      role: string;
    }
  | { kind: "visualFilter"; object: Visual }
  /** A reference elsewhere in the visual's file: formatting, a bound title, sort, and the like. */
  | { kind: "visualProperty"; object: Visual }
  | { kind: "pageFilter"; object: Page }
  | { kind: "pageBinding"; object: Page }
  | { kind: "reportFilter"; object: Report }
  | { kind: "bookmark"; object: Bookmark }
  | { kind: "reportMeasure"; object: ReportMeasure };

export type ReportRefOwnerKind = ReportRefOwner["kind"];

/**
 * What a reference resolves to. `variationOf` is the date column whose variation the reference
 * went through (Desktop's auto date/time), which the visual uses as surely as the level it shows.
 * `unread` is a reference whose target could sit in a file pbiplint could not fully read: one that
 * names the report's extension while reportExtensions.json could not be read, and one to a table
 * the model does not have, or to a field missing from a table, while a model file that could
 * declare it has a parse issue that can take an object out of the model
 * (`TmdlParseIssue.canDropObjects`). What it resolves to is unknown, so it is neither resolved nor
 * unresolved, no rule reports it, and the file's own PARSE_ISSUE finding says why.
 */
export type Resolution =
  | { kind: "column"; column: Column; variationOf?: Column }
  | { kind: "measure"; measure: Measure; variationOf?: Column }
  | { kind: "reportMeasure"; measure: ReportMeasure }
  | { kind: "hierarchy"; hierarchy: Hierarchy; level?: Level; variationOf?: Column }
  | { kind: "unresolved"; reason: string }
  | { kind: "unread"; reason: string };

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
  /** The references that resolve to nothing; an `unread` one is not among them. */
  unresolved(): ReportRef[];
  /** The references a visual's roles bind, in role order. */
  fieldsOf(v: Visual): ReportRef[];
}

const lower = (s: string): string => s.toLowerCase();
const q = (s: string): string => `"${s}"`;

/**
 * Every field reference in the report with what it resolves to. Resolution is by name without
 * regard to case, the way the model's own reference index resolves DAX. A measure is looked up
 * among the report's own measures first, by the table and name the reference gives, then on the
 * model table it names, and a measure that lives on another table is reported as such, since
 * Desktop breaks the visual the same way when a measure moves. A reference that names a schema (Desktop writes `extension` for a report measure)
 * resolves among the report's own measures only, and is `unread` while reportExtensions.json
 * could not be read. Without a model, every other reference is unresolved with one reason. A
 * table the model does not have is `unread` while any model file could not be fully read, and a
 * field missing from a table is `unread` while a file that declares the table could not be, or
 * while a model file has an issue that could have taken a `table` line with it.
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

  const unresolved = (reason: string): Resolution => ({ kind: "unresolved", reason });

  /**
   * The model files pbiplint could not fully read: each has a parse issue that can take an object
   * out of the model, so something it declares may be missing. An orphaned `///` description
   * loses no declaration and does not count.
   */
  const partlyRead = new Set(
    (model?.files ?? []).filter((f) => f.issues.some((i) => i.canDropObjects)).map((f) => f.file),
  );
  const unread = (reason: string, file: string): Resolution => ({
    kind: "unread",
    reason: `${reason}, and ${file} could not be fully read`,
  });
  /**
   * Something the model does not have that any model file could declare: a table, or a bare name
   * in a report measure's DAX, which could be a measure on any table.
   */
  const missing = (reason: string): Resolution =>
    partlyRead.size > 0 ? unread(reason, "a model file") : unresolved(reason);
  /**
   * Something missing from table `t`: its columns, measures, hierarchies, and their variations and
   * levels sit under its declaration, so only a file that declares it could hold the missing
   * thing. The model merges a table declared in several files, so each of them counts. So does a
   * file whose issue can take a `table` line with it (`TmdlParseIssue.canDropRootLines`), since
   * that line could be the table's declaration in a second file, such as a misspelt
   * `table Sales` over the measures a file holds for Sales. A file that declares the table is
   * named first.
   */
  const missingOn = (t: Table, reason: string): Resolution => {
    const files = model?.files ?? [];
    const file = (
      files.find(
        (f) =>
          partlyRead.has(f.file) &&
          f.roots.some((r) => r.kind === "object" && r.type === "table" && r.name === t.name),
      ) ?? files.find((f) => f.issues.some((i) => i.canDropRootLines))
    )?.file;
    return file === undefined ? unresolved(reason) : unread(reason, file);
  };
  const NO_TABLE: Record<NonNullable<FieldRef["noTable"]>, string> = {
    undeclaredAlias: "a filter alias that no From list declares",
    nonTableAlias: "an alias whose From entry names no model table",
    noSource: "a source that names no model table",
  };

  /**
   * The table a date column's variation leads to, found through the table of the variation's
   * default hierarchy, as the model reads `defaultHierarchy`. On a Desktop model that is the local
   * date table, whose hierarchy the auto date/time binding names.
   */
  const throughVariation = (
    t: Table,
    via: NonNullable<FieldRef["variation"]>,
  ): { table: Table; source: Column } | Resolution => {
    // The date column, its variation, and the variation's default hierarchy sit in table `t`'s
    // file; the target table could be declared in any file.
    const source = columnOf(t, via.column);
    if (!source) return missingOn(t, `no column named ${q(via.column)} on ${q(t.name)}`);
    const variation = source.variations.find((v) => lower(v.name) === lower(via.name));
    const on = `column ${q(source.name)} of ${q(t.name)}`;
    if (!variation) return missingOn(t, `no variation named ${q(via.name)} on ${on}`);
    if (variation.defaultHierarchy === undefined)
      return missingOn(t, `variation ${q(variation.name)} on ${on} names no default hierarchy`);
    const target = splitQualifiedName(variation.defaultHierarchy).table;
    const table = tables.get(lower(target));
    if (!table) return missing(`no table named ${q(target)}`);
    return { table, source };
  };

  /**
   * A reference that names a schema and is not one of the report's own measures. The report's
   * extension defines measures only, so a column or a hierarchy named in it is unresolved too.
   * While reportExtensions.json could not be read, what it defines is unknown, so the reference is
   * `unread` rather than unresolved; a missing source is still said, since the visual's own file
   * shows it.
   */
  const notInExtension = (ref: FieldRef): Resolution => {
    if (ref.noTable) return unresolved(NO_TABLE[ref.noTable]);
    if (report.extensions === "unread")
      return { kind: "unread", reason: "reportExtensions.json could not be read" };
    if (ref.kind === "measure")
      return unresolved(
        report.extensions === "absent"
          ? `no measure named ${q(ref.name)} on ${q(ref.table)}: the report defines no extension measures`
          : `no measure named ${q(ref.name)} on ${q(ref.table)} in the report's extension`,
      );
    const what = ref.kind === "hierarchyLevel" ? "hierarchy" : "column";
    return unresolved(
      `the report's extension defines only measures, so no ${what} named ${q(ref.name)} on ${q(ref.table)}`,
    );
  };

  const resolve = (ref: FieldRef): Resolution => {
    const extension = reportMeasures.get(`${lower(ref.table)}\u0000${lower(ref.name)}`);
    if (ref.kind === "measure" && extension && !ref.variation)
      return { kind: "reportMeasure", measure: extension };
    // A reference that names a schema, as Desktop's reference to a report measure names
    // "extension", is looked up among the report's own measures only, which the line above did,
    // with or without a model: a model field of the same name is not the one it names.
    if (ref.schema !== undefined) return notInExtension(ref);
    if (!model) return unresolved("no model in the input");
    if (ref.noTable) return unresolved(NO_TABLE[ref.noTable]);
    const named = tables.get(lower(ref.table));
    if (!named) return missing(`no table named ${q(ref.table)}`);
    let t = named;
    let variationOf: Column | undefined;
    if (ref.variation) {
      const target = throughVariation(named, ref.variation);
      if ("kind" in target) return target;
      t = target.table;
      variationOf = target.source;
    }
    const via = variationOf ? { variationOf } : {};
    if (ref.kind === "column" || ref.kind === "aggregation") {
      const c = columnOf(t, ref.name);
      if (c) return { kind: "column", column: c, ...via };
      // Certain whatever a file could not be read: a column cannot share a name with a measure on
      // its table (https://learn.microsoft.com/dax/best-practices/dax-column-measure-references).
      if (measureOf(t, ref.name))
        return {
          kind: "unresolved",
          reason: `${q(ref.name)} is a measure on ${q(t.name)}, not a column`,
        };
      return missingOn(t, `no column named ${q(ref.name)} on ${q(t.name)}`);
    }
    if (ref.kind === "measure") {
      const m = measureOf(t, ref.name);
      if (m) return { kind: "measure", measure: m, ...via };
      // Certain whatever a file could not be read: a measure's name is unique in the model
      // (https://learn.microsoft.com/dax/dax-syntax-reference, Naming requirements), so no
      // measure of that name sits on the table the reference names.
      const elsewhere = measuresByName.get(lower(ref.name));
      if (elsewhere)
        return {
          kind: "unresolved",
          reason: `[${elsewhere.name}] is on ${q(elsewhere.table.name)}, not ${q(t.name)}`,
        };
      return missingOn(t, `no measure named ${q(ref.name)} on ${q(t.name)}`);
    }
    const h = t.hierarchies.find((x) => lower(x.name) === lower(ref.name));
    if (!h) return missingOn(t, `no hierarchy named ${q(ref.name)} on ${q(t.name)}`);
    if (ref.level === undefined) return { kind: "hierarchy", hierarchy: h, ...via };
    const level = h.levels.find((l) => lower(l.name) === lower(ref.level!));
    if (!level)
      return missingOn(
        t,
        `no level named ${q(ref.level)} in hierarchy ${q(h.name)} on ${q(t.name)}`,
      );
    return { kind: "hierarchy", hierarchy: h, level, ...via };
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
      // After the fields and filters, so a sort entry repeating a binding yields to the binding.
      add({ kind: "visualProperty", object: v }, v.file, v.propertyRefs);
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
        // A qualified name is a measure when the model table carries it or the report's own
        // measures declare it on that table; only then is it a column.
        const kind =
          (t && measureOf(t, raw.name)) ||
          reportMeasures.has(`${lower(raw.table!)}\u0000${lower(raw.name)}`)
            ? "measure"
            : "column";
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
          // Not a measure anywhere nor a column on its own table: it could be a measure on any
          // table, so any model file could declare it.
          refs.push({
            ref: { kind: "measure", table: m.table, name: raw.name, pointer: "" },
            owner,
            file: m.file,
            resolution: missing(`no measure or column named ${q(raw.name)}`),
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
