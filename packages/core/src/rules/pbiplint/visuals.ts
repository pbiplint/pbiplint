import { plural } from "../../format/text.js";
import { allVisuals, hiddenVisualWithFields, reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const HIDDEN_VISUAL_WITH_FIELDS = pbiplintRule({
  id: "HIDDEN_VISUAL_WITH_FIELDS",
  name: "Hidden visual with fields bound",
  category: "Maintenance",
  severity: 1,
  scope: ["Visual"],
  layer: "report",
  // A hidden visual runs no query until a bookmark or the Selection pane shows it, so the finding
  // is one nothing may show, left behind with its fields, not a cost the report pays.
  check: ({ report }) =>
    report
      ? allVisuals(report)
          .filter(hiddenVisualWithFields)
          .map((v) =>
            reportFinding.visual(v, "/isHidden", `${plural(v.projectionCount, "field")} bound`),
          )
      : [],
});

export const visualRules = [HIDDEN_VISUAL_WITH_FIELDS];
