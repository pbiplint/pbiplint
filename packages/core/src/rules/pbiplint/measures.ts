import { reportFinding, reportMeasuresToMove } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const REPORT_LEVEL_MEASURES = pbiplintRule({
  id: "REPORT_LEVEL_MEASURES",
  name: "Measure defined in the report",
  category: "Maintenance",
  severity: 2,
  scope: ["ReportMeasure"],
  layer: "report",
  // Its findings are report objects, yet it reports only beside the model the report reads, so a
  // run without the model skips it rather than counting it as run.
  needs: ["model", "report"],
  // The detail says where the measure lives; the rule's page gives the fix.
  check: (project) =>
    reportMeasuresToMove(project).map((m) =>
      reportFinding.reportMeasure(m, `defined in the report on table "${m.table}"`),
    ),
});

export const measureRules = [REPORT_LEVEL_MEASURES];
