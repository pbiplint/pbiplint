import { columnRef, measureRef } from "../../model/names.js";
import type { FieldRef } from "../../pbir/types.js";
import { finding } from "../helpers.js";
import { reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/**
 * `'Sales'[Region]`, `[Net Margin]`, `'Date'[Calendar].[Year]`, and, through a date column's
 * variation, `'Sales'[OrderDate].[Date Hierarchy].[Year]`. A reference whose source yields no
 * table has its reason say so, so it is labelled by its names alone.
 */
const fieldLabel = (ref: FieldRef): string => {
  const inTable = (name: string): string =>
    ref.table === "" ? measureRef(name) : columnRef(ref.table, name);
  const field = ref.variation
    ? `${inTable(ref.variation.column)}.${measureRef(ref.name)}`
    : ref.kind === "measure"
      ? measureRef(ref.name)
      : inTable(ref.name);
  return ref.kind === "hierarchyLevel" && ref.level ? `${field}.${measureRef(ref.level)}` : field;
};

/**
 * The first finding for each object and missing field. One field can be named several times on an
 * object: an applied filter names it in `field` and again in its `Where`, a visual's own filter
 * entry or sort entry repeats a role binding, a bookmark's state can repeat it. The index keeps
 * every reference; the rule reports the field once, at its earliest reference. The key holds the
 * file, so two objects that share a label and an id in different files, such as visuals with the
 * same id on two pages with the same name, are not taken for one.
 */
const firstPerObjectAndField = (findings: RuleFinding[]): RuleFinding[] => {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = [f.location?.file, f.objectType, f.objectId, f.objectName, f.detail].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const BROKEN_FIELD_REFERENCE = pbiplintRule({
  id: "BROKEN_FIELD_REFERENCE",
  name: "Field the model does not have",
  category: "Error Prevention",
  severity: 3,
  scope: ["Visual", "Page", "Report", "Bookmark"],
  layer: "project",
  check: (_project, ctx) =>
    firstPerObjectAndField(
      ctx.indexes.reportRefs!.unresolved().flatMap((r): RuleFinding[] => {
        if (r.resolution.kind !== "unresolved") return [];
        const detail = `${fieldLabel(r.ref)}: ${r.resolution.reason}`;
        const o = r.owner;
        switch (o.kind) {
          case "visualField":
          case "visualFilter":
          case "visualProperty":
            return [reportFinding.visual(o.object, r.ref.pointer, detail)];
          case "pageFilter":
            return [reportFinding.pageFilter(o.object, r.ref.pointer, detail)];
          case "pageBinding":
            return [reportFinding.page(o.object, r.ref.pointer, detail)];
          case "reportFilter":
            return [reportFinding.reportFilter(o.object, r.ref.pointer, detail)];
          case "bookmark":
            return [reportFinding.bookmark(o.object, detail, r.ref.pointer)];
          // A report measure's DAX is the measure's own problem; REPORT_LEVEL_MEASURES sends it to
          // the model, where the DAX rules read it.
          case "reportMeasure":
            return [];
        }
      }),
    ),
});

export const NOT_REACHED_FROM_REPORT = pbiplintRule({
  id: "NOT_REACHED_FROM_REPORT",
  name: "Not reached from the report",
  category: "Maintenance",
  severity: 1,
  scope: ["Column", "CalculatedColumn", "CalculatedTableColumn", "Measure"],
  layer: "project",
  // A report file that could not be read may reach any field in the model, so while one is unread
  // the rule cannot say what the report does not reach.
  needsEveryReportFileRead: true,
  check: (_project, ctx) => {
    const reach = ctx.indexes.reachability!;
    const { columns, measures } = reach.unreached();
    // Measures first, so a dead chain reads top-down: the measure nothing uses, then what only it used.
    return [
      ...measures.map((m) => ({ ...finding.measure(m), detail: reach.reasonFor(m) })),
      ...columns.map((c) => ({ ...finding.column(c), detail: reach.reasonFor(c) })),
    ];
  },
});

export const referenceRules = [BROKEN_FIELD_REFERENCE, NOT_REACHED_FROM_REPORT];
