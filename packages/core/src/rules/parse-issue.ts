import type { ParseIssue } from "../tmdl/types.js";
import { RULE_SUMMARIES } from "./rule-summaries.data.js";
import type { Rule, RuleFinding } from "./types.js";

/** Built-in rule that surfaces parser issues in the same list as everything else (spec section 5). */
export const PARSE_ISSUE: Rule = {
  id: "PARSE_ISSUE",
  name: "TMDL could not be fully parsed",
  category: "Error Prevention",
  severity: 3,
  scope: ["File"],
  layer: "project",
  needs: [],
  description: RULE_SUMMARIES["PARSE_ISSUE"] ?? "TMDL could not be fully parsed",
  references: ["https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview"],
  status: "builtin",
  check: ({ model, report }) => {
    const issue =
      (layer: "model" | "report") =>
      (i: ParseIssue): RuleFinding => ({
        objectType: "File",
        objectName: i.file,
        layer,
        location: { file: i.file, line: i.line },
        detail: `${i.reason}: ${i.text.trim()}`,
      });
    return [
      ...(model?.files.flatMap((f) => f.issues) ?? []).map(issue("model")),
      ...(report?.issues ?? []).map(issue("report")),
    ];
  },
};
