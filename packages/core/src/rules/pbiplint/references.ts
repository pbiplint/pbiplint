import { columnRef, measureRef } from "../../model/names.js";
import type { FieldRef } from "../../pbir/types.js";
import { finding } from "../helpers.js";
import { reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/**
 * `'Sales'[Region]`, `[Net Margin]`, `'Date'[Calendar].[Year]`. A reference through an alias no
 * From list declares has no table, and its reason says so, so it is labelled by its name alone.
 */
const fieldLabel = (ref: FieldRef): string => {
  const field =
    ref.kind === "measure" || ref.table === ""
      ? measureRef(ref.name)
      : columnRef(ref.table, ref.name);
  return ref.kind === "hierarchyLevel" && ref.level ? `${field}.${measureRef(ref.level)}` : field;
};

export const BROKEN_FIELD_REFERENCE = pbiplintRule({
  id: "BROKEN_FIELD_REFERENCE",
  name: "Field the model does not have",
  category: "Error Prevention",
  severity: 3,
  scope: ["Visual", "Page", "Report", "Bookmark"],
  layer: "project",
  check: (_project, ctx) =>
    ctx.indexes.reportRefs!.unresolved().flatMap((r): RuleFinding[] => {
      if (r.resolution.kind !== "unresolved") return [];
      const detail = `${fieldLabel(r.ref)}: ${r.resolution.reason}`;
      const o = r.owner;
      switch (o.kind) {
        case "visualField":
        case "visualFilter":
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
});

export const NOT_REACHED_FROM_REPORT = pbiplintRule({
  id: "NOT_REACHED_FROM_REPORT",
  name: "Not reached from the report",
  category: "Maintenance",
  severity: 1,
  scope: ["Column", "CalculatedColumn", "CalculatedTableColumn", "Measure"],
  layer: "project",
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
