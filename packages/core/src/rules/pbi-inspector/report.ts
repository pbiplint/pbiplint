import { allVisuals, reportFinding, visualFileUnread } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

/**
 * Names each custom visual report.json registers in `publicCustomVisuals` that no visual uses.
 *
 * While a visual.json could not be read, the rule is skipped with the reason `reportFileUnread`:
 * the unread visual could be of any registered type, so pbiplint cannot say one is unused. This is
 * what it does on a file neither tool can read, not a difference parity shows; the oracle fixtures
 * all parse.
 */
export const REMOVE_UNUSED_CUSTOM_VISUALS = inspectorRule(
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  { category: "Performance", scope: ["Report"], skipWhenUnread: visualFileUnread },
  (report) => {
    const used = new Set(allVisuals(report).map((v) => v.type));
    // One finding per unused visual, with its type name as the object id, which is what the oracle lists.
    return report.publicCustomVisuals
      .filter((name) => !used.has(name))
      .map((name) =>
        reportFinding.report(report, `${name} is registered but no visual uses it`, name),
      );
  },
);

export const reportRules = [REMOVE_UNUSED_CUSTOM_VISUALS];
