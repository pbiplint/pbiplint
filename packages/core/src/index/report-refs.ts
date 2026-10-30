import { formatMessage, msg, type Message } from "../messages/format.js";
import { modelDeclarations, splitQualifiedName } from "../model/build.js";
import type {
  Column,
  DaxFunction,
  Hierarchy,
  Level,
  Measure,
  Model,
  Table,
} from "../model/types.js";
import type { Bookmark, FieldRef, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import { tokenizeDax } from "../dax/tokenize.js";
import {
  functionCallReader,
  refsInTokens,
  resolveBareName,
  type BareNameLookup,
} from "./references.js";

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
 * (`TmdlParseIssue.canDropObjects`) or a model path could not be read at all
 * (`Model.unreadPaths`). What it resolves to is unknown, so it is neither resolved nor
 * unresolved, no rule reports it, and the file's own PARSE_ISSUE finding, or the input reader's
 * notice, says why. A reason is a message, and `reason` its English.
 */
export type Resolution =
  | { kind: "column"; column: Column; variationOf?: Column }
  | { kind: "measure"; measure: Measure; variationOf?: Column }
  | { kind: "reportMeasure"; measure: ReportMeasure }
  | { kind: "hierarchy"; hierarchy: Hierarchy; level?: Level; variationOf?: Column }
  | { kind: "unresolved"; reason: string; message: Message }
  | { kind: "unread"; reason: string; message: Message };

export interface ReportRef {
  ref: FieldRef;
  owner: ReportRefOwner;
  file: string;
  resolution: Resolution;
}

export interface ReportReferenceIndex {
  refs: ReportRef[];
  /** The references that resolve to nothing; an `unread` one is not among them. */
  unresolved(): ReportRef[];
  /** The references a visual's roles bind, in role order. */
  fieldsOf(v: Visual): ReportRef[];
  /**
   * Each of the report's own measures that calls a user-defined function of the model, in the
   * report's order, with the functions it calls, each once, in model order.
   */
  functionCalls: { measure: ReportMeasure; calls: DaxFunction[] }[];
}

const lower = (s: string): string => s.toLowerCase();
/** A resolution that is not one, for the reason `message`, with `reason` its English. */
const failed = (kind: "unresolved" | "unread", message: Message): Resolution => ({
  kind,
  reason: formatMessage(message),
  message,
});

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
 * while a model file has an issue that could have taken a `table` line with it. A model path the
 * input reader could not read at all could declare any table and anything under one, so while
 * there is one, both are `unread`.
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

  const unresolved = (reason: Message): Resolution => failed("unresolved", reason);

  /**
   * The model files pbiplint could not fully read: each has a parse issue that can take an object
   * out of the model, so something it declares may be missing. An orphaned `///` description
   * loses no declaration and does not count.
   */
  const partlyRead = new Set(
    (model?.files ?? []).filter((f) => f.issues.some((i) => i.canDropObjects)).map((f) => f.file),
  );
  /** Unread for `reason` while `file` could not be fully read, or, with no file, any model file. */
  const unread = (reason: Message, file?: string): Resolution =>
    failed(
      "unread",
      file === undefined
        ? msg("BROKEN_FIELD_REFERENCE.unreadModelFile", { reason })
        : msg("BROKEN_FIELD_REFERENCE.unread", { reason, file }),
    );
  /**
   * The first model path the input reader could not read at all, which counts as a file whose
   * issue can take an object and a `table` line with it: it could declare anything.
   */
  const neverRead = model?.unreadPaths[0];
  const notRead = (reason: Message, path: string): Resolution =>
    failed("unread", msg("BROKEN_FIELD_REFERENCE.notRead", { reason, path }));
  /**
   * Something the model does not have that any model file could declare: a table, or a bare name
   * in a report measure's DAX, which could be a measure on any table. A path never read is named
   * in place of "a model file", since it is a path the reader can find.
   */
  const missing = (reason: Message): Resolution =>
    neverRead !== undefined
      ? notRead(reason, neverRead)
      : partlyRead.size > 0
        ? unread(reason)
        : unresolved(reason);
  /**
   * Something missing from table `t`: its columns, measures, hierarchies, and their variations and
   * levels sit under its declaration, so only a file that declares it could hold the missing
   * thing. The model merges a table declared in several files, so each of them counts, one that
   * declares it under its model included (`modelDeclarations`, #137). So does a file whose issue
   * can take a `table` line with it (`TmdlParseIssue.canDropTableLine`), since that line could be
   * the table's declaration in a second file, such as a misspelt `table Sales` over the measures a
   * file holds for Sales, and so does a path never read, which could declare the table again. A
   * file that declares the table is named first, then a path never read.
   */
  const missingOn = (t: Table, reason: Message): Resolution => {
    const files = model?.files ?? [];
    const declaring = files.find(
      (f) =>
        partlyRead.has(f.file) &&
        modelDeclarations(f).some(
          (r) => r.kind === "object" && r.type === "table" && r.name === t.name,
        ),
    );
    if (declaring) return unread(reason, declaring.file);
    if (neverRead !== undefined) return notRead(reason, neverRead);
    const file = files.find((f) => f.issues.some((i) => i.canDropTableLine))?.file;
    return file === undefined ? unresolved(reason) : unread(reason, file);
  };
  const noTable = (cause: NonNullable<FieldRef["noTable"]>): Resolution =>
    unresolved(msg("BROKEN_FIELD_REFERENCE.noSourceTable", { cause }));

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
    if (!source)
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noColumn", { column: via.column, table: t.name }),
      );
    const variation = source.variations.find((v) => lower(v.name) === lower(via.name));
    const on = { column: source.name, table: t.name };
    if (!variation)
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noVariation", { variation: via.name, ...on }),
      );
    if (variation.defaultHierarchy === undefined)
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noDefaultHierarchy", { variation: variation.name, ...on }),
      );
    const target = splitQualifiedName(variation.defaultHierarchy).table;
    const table = tables.get(lower(target));
    if (!table) return missing(msg("BROKEN_FIELD_REFERENCE.noTable", { table: target }));
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
    if (ref.noTable) return noTable(ref.noTable);
    if (report.extensions === "unread")
      return failed("unread", msg("BROKEN_FIELD_REFERENCE.extensionUnread"));
    if (ref.kind === "measure")
      return unresolved(
        msg(
          report.extensions === "absent"
            ? "BROKEN_FIELD_REFERENCE.noExtensionMeasures"
            : "BROKEN_FIELD_REFERENCE.notInExtension",
          { measure: ref.name, table: ref.table },
        ),
      );
    return unresolved(
      msg("BROKEN_FIELD_REFERENCE.extensionMeasuresOnly", {
        kind: ref.kind === "hierarchyLevel" ? "hierarchy" : "column",
        name: ref.name,
        table: ref.table,
      }),
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
    if (!model) return unresolved(msg("BROKEN_FIELD_REFERENCE.noModel"));
    if (ref.noTable) return noTable(ref.noTable);
    const named = tables.get(lower(ref.table));
    if (!named) return missing(msg("BROKEN_FIELD_REFERENCE.noTable", { table: ref.table }));
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
        return unresolved(
          msg("BROKEN_FIELD_REFERENCE.measureNotColumn", { measure: ref.name, table: t.name }),
        );
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noColumn", { column: ref.name, table: t.name }),
      );
    }
    if (ref.kind === "measure") {
      const m = measureOf(t, ref.name);
      if (m) return { kind: "measure", measure: m, ...via };
      // Certain whatever a file could not be read: a measure's name is unique in the model
      // (https://learn.microsoft.com/dax/dax-syntax-reference, Naming requirements), so no
      // measure of that name sits on the table the reference names.
      const elsewhere = measuresByName.get(lower(ref.name));
      if (elsewhere)
        return unresolved(
          msg("BROKEN_FIELD_REFERENCE.measureElsewhere", {
            measure: elsewhere.name,
            measureTable: elsewhere.table.name,
            table: t.name,
          }),
        );
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noMeasure", { measure: ref.name, table: t.name }),
      );
    }
    const h = t.hierarchies.find((x) => lower(x.name) === lower(ref.name));
    if (!h)
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noHierarchy", { hierarchy: ref.name, table: t.name }),
      );
    if (ref.level === undefined) return { kind: "hierarchy", hierarchy: h, ...via };
    const level = h.levels.find((l) => lower(l.name) === lower(ref.level!));
    if (!level)
      return missingOn(
        t,
        msg("BROKEN_FIELD_REFERENCE.noLevel", {
          level: ref.level,
          hierarchy: h.name,
          table: t.name,
        }),
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
  // A report measure's DAX is read the way a model measure's is, by the same resolver: a bare [X]
  // is a measure anywhere in the model or the report, else nothing when it is a column the DAX
  // creates (`created`), else a column on the measure's own table, else on the first other table
  // that has one.
  const bareLookup: BareNameLookup<{ table: string; name: string }> = {
    tables: model?.tables ?? [],
    columnOf,
    measureNamed: (name) => {
      const inModel = measuresByName.get(lower(name));
      return inModel
        ? { table: inModel.table.name, name: inModel.name }
        : reportMeasuresByName.get(lower(name));
    },
  };
  const callsIn = functionCallReader(model?.functions ?? []);
  const functionCalls: ReportReferenceIndex["functionCalls"] = [];
  for (const m of report.measures) {
    const owner: ReportRefOwner = { kind: "reportMeasure", object: m };
    const tokens = tokenizeDax(m.expression);
    const calls = callsIn(tokens);
    if (calls.length > 0) functionCalls.push({ measure: m, calls });
    for (const raw of refsInTokens(tokens)) {
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
      const bare = resolveBareName(
        raw,
        { kind: "reportMeasure", table: tables.get(lower(m.table)) },
        bareLookup,
      );
      if (bare.kind === "measure")
        add(owner, m.file, [
          { kind: "measure", table: bare.measure.table, name: bare.measure.name, pointer: "" },
        ]);
      else if (bare.kind === "columns")
        add(
          owner,
          m.file,
          bare.columns.map((c) => ({
            kind: "column",
            table: c.table.name,
            name: c.name,
            pointer: "",
          })),
        );
      else
        // No measure anywhere nor a column on any table: it could be a measure on any table, so
        // any model file could declare it.
        refs.push({
          ref: { kind: "measure", table: m.table, name: raw.name, pointer: "" },
          owner,
          file: m.file,
          resolution: missing(msg("BROKEN_FIELD_REFERENCE.noMeasureOrColumn", { name: raw.name })),
        });
    }
  }

  return {
    refs,
    unresolved: () => refs.filter((r) => r.resolution.kind === "unresolved"),
    fieldsOf: (v) => refs.filter((r) => r.owner.kind === "visualField" && r.owner.object === v),
    functionCalls,
  };
}
