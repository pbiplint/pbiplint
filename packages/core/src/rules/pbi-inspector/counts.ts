import type { Report } from "../../pbir/types.js";
import { allVisuals, reportFinding } from "../report-helpers.js";
import type { RuleContext } from "../types.js";
import { inspectorRule } from "./define.js";

/** The source leaves these out of the per-page count: they cost no query. */
const NOT_COUNTED = new Set(["shape", "slicer", "actionButton", "textbox"]);
const max = (ctx: RuleContext, name = "max"): number => Number(ctx.options[name]);

export const REDUCE_VISUALS_ON_PAGE = inspectorRule(
  "REDUCE_VISUALS_ON_PAGE",
  {
    category: "Performance",
    scope: ["Page"],
    options: [{ name: "max", type: "number", default: 20 }],
  },
  (report, ctx) =>
    report.pages.flatMap((p) => {
      // A visual group container is counted, as the source counts everything with no excluded type.
      const n = p.visuals.filter((v) => !v.isHidden && !NOT_COUNTED.has(v.type)).length;
      return n > max(ctx)
        ? [reportFinding.page(p, undefined, `${n} visible visuals, more than ${max(ctx)}`)]
        : [];
    }),
);

/** Deviation: the fields bound to the visual's roles, once each, not every `projections` array in the file. */
export const REDUCE_OBJECTS_WITHIN_VISUALS = inspectorRule(
  "REDUCE_OBJECTS_WITHIN_VISUALS",
  {
    category: "Performance",
    scope: ["Visual"],
    options: [{ name: "max", type: "number", default: 6 }],
  },
  (report, ctx) =>
    allVisuals(report).flatMap((v) =>
      v.fields.length > max(ctx)
        ? [
            reportFinding.visual(
              v,
              "/visual/query",
              `${v.fields.length} fields bound, more than ${max(ctx)}`,
            ),
          ]
        : [],
    ),
);

const pagesWithFilteredVisuals = (
  report: Report,
  ctx: RuleContext,
  keep: (type: string | undefined, applied: boolean) => boolean,
  what: string,
) =>
  report.pages.flatMap((p) => {
    const n = p.visuals.filter((v) => v.filters.some((f) => keep(f.type, f.applied))).length;
    return n > max(ctx)
      ? [reportFinding.page(p, undefined, `${n} visuals with ${what}, more than ${max(ctx)}`)]
      : [];
  });

export const REDUCE_TOPN_FILTERS = inspectorRule(
  "REDUCE_TOPN_FILTERS",
  {
    category: "Performance",
    scope: ["Page"],
    options: [{ name: "max", type: "number", default: 4 }],
  },
  (report, ctx) =>
    pagesWithFilteredVisuals(report, ctx, (type) => type === "TopN", "a TopN filter"),
);

/** Deviation: only Advanced filters with a condition applied; one with nothing set, such as a slicer's or one Desktop writes for a visual's own fields, is not counted. */
export const REDUCE_ADVANCED_FILTERS = inspectorRule(
  "REDUCE_ADVANCED_FILTERS",
  {
    category: "Performance",
    scope: ["Page"],
    options: [{ name: "max", type: "number", default: 4 }],
  },
  (report, ctx) =>
    pagesWithFilteredVisuals(
      report,
      ctx,
      (type, applied) => type === "Advanced" && applied,
      "an Advanced filter applied",
    ),
);

export const REDUCE_PAGES = inspectorRule(
  "REDUCE_PAGES",
  {
    category: "Performance",
    scope: ["Report"],
    options: [{ name: "max", type: "number", default: 10 }],
  },
  (report, ctx) =>
    report.pages.length > max(ctx)
      ? [reportFinding.report(report, `${report.pages.length} pages, more than ${max(ctx)}`)]
      : [],
);

export const countRules = [
  REDUCE_VISUALS_ON_PAGE,
  REDUCE_OBJECTS_WITHIN_VISUALS,
  REDUCE_TOPN_FILTERS,
  REDUCE_ADVANCED_FILTERS,
  REDUCE_PAGES,
];
