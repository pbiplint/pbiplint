import type { LintResult } from "../engine/lint.js";
import { SEVERITY_LABEL } from "../rules/types.js";
import { locationOf, skippedLine, summaryLine, topGroups, type FormatOptions } from "./text.js";

const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function formatMarkdown(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [
    "# pbiplint report",
    "",
    `${summaryLine(result)}. ${skippedLine(result)}.`,
    "",
  ];
  if (result.groups.length === 0) {
    out.push("No findings.", "");
    return out.join("\n");
  }
  out.push("## Fix these first", "");
  topGroups(result).forEach((g, i) =>
    out.push(`${i + 1}. **${g.rule.name}** (${g.findings.length}) [${g.rule.id}](${g.rule.url})`),
  );
  out.push("");
  for (const g of result.groups) {
    out.push(
      `## ${SEVERITY_LABEL[g.rule.severity].toUpperCase()}: ${g.rule.name} (${g.findings.length})`,
      "",
    );
    out.push(`[${g.rule.id}](${g.rule.url}) · ${g.rule.category}`, "");
    out.push("| Object | Type | Location | Detail |", "|---|---|---|---|");
    for (const f of g.findings)
      out.push(
        `| \`${cell(f.objectName)}\` | ${f.objectType} | ${locationOf(f)} | ${cell(f.detail ?? "")} |`,
      );
    out.push("");
  }
  return out.join("\n");
}
