import { allVisuals, reportFinding } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

export const REMOVE_UNUSED_CUSTOM_VISUALS = inspectorRule(
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  { category: "Performance", scope: ["Report"] },
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
