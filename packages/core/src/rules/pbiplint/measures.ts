import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const REPORT_LEVEL_MEASURES = pbiplintRule({
  id: "REPORT_LEVEL_MEASURES",
  name: "Measure defined in the report",
  category: "Maintenance",
  severity: 2,
  scope: ["ReportMeasure"],
  layer: "report",
  // The detail says where the measure lives; the rule's page gives the fix.
  check: ({ report }) =>
    report
      ? report.measures.map((m) =>
          reportFinding.reportMeasure(m, `defined in the report on table "${m.table}"`),
        )
      : [],
});

export const measureRules = [REPORT_LEVEL_MEASURES];
