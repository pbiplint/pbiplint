import type { LintResult } from "../engine/lint.js";
import { ruleUrl } from "../model/names.js";
import { SEVERITY_LABEL } from "../rules/types.js";
import {
  layersLine,
  locationOf,
  skippedLine,
  summaryLine,
  topGroups,
  type FormatOptions,
} from "./text.js";

const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function formatMarkdown(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [
    "# pbiplint report",
    "",
    `${summaryLine(result)}. ${[layersLine(result), skippedLine(result)].filter(Boolean).join(" ")}.`,
    "",
  ];
  for (const d of result.diagnostics) out.push(`> Notice: ${cell(d.message)}`, "");
  if (result.facts.length) {
    out.push("## Report at a glance", "", "| Fact | Value | Rule |", "|---|---|---|");
    for (const f of result.facts)
      out.push(
        `| ${cell(f.label)} | ${cell(f.detail ? `${f.value} (${f.detail})` : f.value)} | ${f.ruleId ? `[${f.ruleId}](${ruleUrl(f.ruleId)})` : ""} |`,
      );
    out.push("");
  }
  if (result.groups.length === 0) {
    out.push("No findings.", "");
    return out.join("\n");
  }
  out.push("## Fix these first", "");
  topGroups(result).forEach((g, i) =>
    out.push(
      `${i + 1}. **${g.rule.name}** (${g.findings.length}) [${g.rule.id}](${g.rule.url}) · ${g.rule.layer}`,
    ),
  );
  out.push("");
  for (const g of result.groups) {
    out.push(
      `## ${SEVERITY_LABEL[g.rule.severity].toUpperCase()}: ${g.rule.name} (${g.findings.length}) · ${g.rule.layer}`,
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
