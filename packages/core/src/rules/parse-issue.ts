import { RULE_SUMMARIES } from "./rule-summaries.data.js";
import type { Rule } from "./types.js";

/** Built-in rule that surfaces parser issues in the same list as everything else (spec section 5). */
export const PARSE_ISSUE: Rule = {
  id: "PARSE_ISSUE",
  name: "TMDL could not be fully parsed",
  category: "Error Prevention",
  severity: 3,
  scope: ["File"],
  description: RULE_SUMMARIES["PARSE_ISSUE"] ?? "TMDL could not be fully parsed",
  references: ["https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview"],
  status: "builtin",
  check: (model) =>
    model.files.flatMap((f) =>
      f.issues.map((issue) => ({
        objectType: "File" as const,
        objectName: issue.file,
        location: { file: issue.file, line: issue.line },
        detail: `${issue.reason}: ${issue.text.trim()}`,
      })),
    ),
};
