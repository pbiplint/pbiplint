import {
  layersLine,
  noticeLines,
  SEVERITY_LABEL,
  showControls,
  skippedLine,
  summaryLine,
  type LintResult,
} from "@pbiplint/core";

/**
 * The text report's last line when it has findings. It lives here, with the quiet report's, so
 * the several-project formats in several.ts end the same way without importing main.
 */
export const EXPLAIN_HINT = "Run pbiplint explain <RULE_ID> for a rule's guidance, offline.";

/** The quiet report's last line when it has findings. */
export const QUIET_NEXT =
  "Next: pbiplint <path> --rule <RULE_ID> for a rule's findings, pbiplint explain <RULE_ID> for how to fix it.";

/**
 * The text format's header (the summary, the layers and what was skipped, which names a part left
 * unread, and the notices), then `<severity> <RULE_ID> <count>` for each rule with findings, in the
 * text format's order, then the next step. For an assistant that lints after every edit.
 */
export function quietText(result: LintResult): string {
  const out = [
    `pbiplint: ${summaryLine(result)}`,
    showControls([layersLine(result), skippedLine(result)].filter(Boolean).join(" ")),
    ...noticeLines(result),
  ];
  if (result.groups.length === 0) out.push("No findings.");
  else
    out.push(
      ...result.groups.map(
        (g) => `${SEVERITY_LABEL[g.rule.severity]} ${quietId(g.rule)} ${g.findings.length}`,
      ),
      QUIET_NEXT,
    );
  return out.join("\n") + "\n";
}

/**
 * A rule's id as a quiet rule line writes it. A rule line splits on single spaces, and the CLI
 * page promises a rule id holds none, so each whitespace character in a custom rule's id (a
 * team's file can hold one, and Tabular Editor runs it) is written as `%20`, and what is left is
 * shown. A built-in id is written as it is.
 */
const quietId = (rule: LintResult["groups"][number]["rule"]): string =>
  rule.custom ? showControls(rule.id.replace(/\s/g, "%20")) : rule.id;
