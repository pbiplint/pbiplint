import { allVisuals, customVisualUseUnknown, reportFinding } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

/**
 * Names each custom visual report.json registers in `publicCustomVisuals` that no visual uses.
 *
 * While a visual.json could not be read and a registered type is used by no visual that was read,
 * the rule is skipped with the reason `reportFileUnread` (`customVisualUseUnknown`): the unread
 * visual could be of that type, so pbiplint cannot say it is unused. With no custom visual
 * registered, or every registered type used by a visual that was read, the rule runs. This is what
 * it does on a file neither tool can read, not a difference parity shows; the oracle fixtures all
 * parse.
 */
export const REMOVE_UNUSED_CUSTOM_VISUALS = inspectorRule(
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  { category: "Performance", scope: ["Report"], skipWhenUnread: customVisualUseUnknown },
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
