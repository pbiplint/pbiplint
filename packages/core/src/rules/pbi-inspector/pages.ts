import {
  isDrillthroughPage,
  isHiddenPage,
  isTooltipPage,
  reportFinding,
  visiblePages,
} from "../report-helpers.js";
import { inspectorRule } from "./define.js";

const BOUND_TYPES = new Set(["Tooltip", "Drillthrough"]);

/**
 * A visible page that page.json marks as a tooltip page (`isTooltipPage`, by its own `type` or its
 * `pageBinding`) or a drillthrough page (`isDrillthroughPage`, by its `pageBinding` alone). The
 * finding points at `pageBinding` when the binding's `type` marks the page, else at the page's own
 * `type`, and its detail names the kind that marking gives.
 *
 * Deviation: pbiplint reads a tooltip page from page.json's own `type` as well as its `pageBinding`, where PBI Inspector reads only `pageBinding.type`, so it also reports the tooltip pages Power BI Desktop marks by `type` alone.
 *
 * No oracle fixture has a tooltip page marked by `type` alone, so no expectation file records the
 * deviation; rules-report-pages.test.ts pins pbiplint's behaviour.
 */
export const HIDE_TOOLTIP_DRILLTROUGH_PAGES = inspectorRule(
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  { category: "Report Design", scope: ["Page"] },
  (report) =>
    report.pages
      .filter((p) => (isTooltipPage(p) || isDrillthroughPage(p)) && !isHiddenPage(p))
      .map((p) => {
        const byBinding = p.bindingType !== undefined && BOUND_TYPES.has(p.bindingType);
        // Without a marking pageBinding, the page's own type is Tooltip.
        const kind = byBinding ? p.bindingType! : p.type!;
        return reportFinding.page(
          p,
          byBinding ? "/pageBinding" : "/type",
          `${kind.toLowerCase()} page is visible to readers`,
        );
      }),
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
