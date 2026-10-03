import {
  layersLine,
  noticeLines,
  SEVERITY_LABEL,
  showControls,
  skippedLine,
  summaryLine,
  type LintResult,
} from "@pbiplint/core";

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
        (g) => `${SEVERITY_LABEL[g.rule.severity]} ${g.rule.id} ${g.findings.length}`,
      ),
      QUIET_NEXT,
    );
  return out.join("\n") + "\n";
}
