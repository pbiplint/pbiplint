import { isHiddenPage, reportFinding, visiblePages } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

const BOUND_TYPES = new Set(["Tooltip", "Drillthrough"]);

export const HIDE_TOOLTIP_DRILLTROUGH_PAGES = inspectorRule(
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  { category: "Report Design", scope: ["Page"] },
  (report) =>
    report.pages
      .filter(
        (p) => p.bindingType !== undefined && BOUND_TYPES.has(p.bindingType) && !isHiddenPage(p),
      )
      .map((p) =>
        reportFinding.page(
          p,
          "/pageBinding",
          `${p.bindingType!.toLowerCase()} page is visible to readers`,
        ),
      ),
);

export const ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY = inspectorRule(
  "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY",
  {
    category: "Report Design",
    scope: ["Page"],
    options: [{ name: "maxHeight", type: "number", default: 720 }],
  },
  (report, ctx) =>
    visiblePages(report)
      .filter((p) => (p.height ?? 0) > Number(ctx.options.maxHeight))
      .map((p) =>
        reportFinding.page(p, "/height", `height ${p.height}, more than ${ctx.options.maxHeight}`),
      ),
);

export const pageRules = [HIDE_TOOLTIP_DRILLTROUGH_PAGES, ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY];
