import { maskLiterals } from "../m/mask.js";
import type { ParseIssue } from "../tmdl/types.js";
import { RULE_SUMMARIES } from "./rule-summaries.data.js";
import type { Rule, RuleFinding } from "./types.js";

/** Built-in rule that surfaces parser issues in the same list as everything else (spec section 5). */
export const PARSE_ISSUE: Rule = {
  id: "PARSE_ISSUE",
  name: "File could not be fully parsed",
  category: "Error Prevention",
  severity: 3,
  scope: ["File"],
  layer: "project",
  needs: [],
  description: RULE_SUMMARIES["PARSE_ISSUE"] ?? "File could not be fully parsed",
  references: ["https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview"],
  status: "builtin",
  check: ({ model, report }, { indexes }) => {
    const issue =
      (layer: "model" | "report") =>
      (i: ParseIssue & { column?: number }): RuleFinding => ({
        objectType: "File",
        objectName: i.file,
        layer,
        location: {
          file: i.file,
          line: i.line,
          ...(i.column !== undefined ? { column: i.column } : {}),
        },
        detail: `${i.reason}: ${i.text.trim()}`,
      });
    return [
      // A TMDL line with its text literals hidden (v3 spec, section 7); M's issues come masked.
      ...(model?.files.flatMap((f) => f.issues) ?? [])
        .map((i) => ({ ...i, text: maskLiterals(i.text) }))
        .map(issue("model")),
      // M that Microsoft's parser rejects (v3 spec, section 7), after the TMDL issues.
      ...indexes.m.issues.map(issue("model")),
      ...(report?.issues ?? []).map(issue("report")),
    ];
  },
};
