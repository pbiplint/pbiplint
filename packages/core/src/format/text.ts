import type { LintResult } from "../engine/lint.js";
import type { RankedGroup } from "../engine/rank.js";
import { SEVERITY_LABEL, type Finding } from "../rules/types.js";

export interface FormatOptions {
  toolVersion?: string;
  rules?: import("../rules/types.js").Rule[];
}

const SEVERITY_TAG = { 3: "ERROR", 2: "WARN ", 1: "INFO " } as const;

export const locationOf = (f: Finding): string =>
  f.location ? `${f.location.file}:${f.location.line}` : "";

/** Summary sentence shared by the text and markdown formats. */
export function summaryLine(result: LintResult): string {
  const s = result.summary;
  return `${s.findings} findings (${s.errors} errors, ${s.warnings} warnings, ${s.infos} info) in ${s.files} files`;
}

export function skippedLine(result: LintResult): string {
  const s = result.summary;
  const live = s.rulesSkipped.filter((r) => r.reason === "needsLiveModel").length;
  const disabled = s.rulesSkipped.filter((r) => r.reason === "disabled").length;
  const parts = [`${s.rulesRun} rules run`];
  if (live) parts.push(`${live} rules skipped (need a live model)`);
  if (disabled) parts.push(`${disabled} rules disabled by config`);
  if (s.ignored) parts.push(`${s.ignored} findings ignored by annotation`);
  return parts.join(", ");
}

export const topGroups = (result: LintResult, n = 5): RankedGroup[] => result.groups.slice(0, n);

export function formatText(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [`pbiplint: ${summaryLine(result)}`, skippedLine(result), ""];
  if (result.groups.length === 0) {
    out.push("No findings.", "");
  } else {
    out.push("Fix these first:");
    topGroups(result).forEach((g, i) =>
      out.push(
        `  ${i + 1}. ${g.rule.name}  (${g.findings.length} ${SEVERITY_LABEL[g.rule.severity]}${g.findings.length === 1 ? "" : "s"})`,
      ),
    );
    out.push("");
    for (const g of result.groups) {
      out.push(
        `${SEVERITY_TAG[g.rule.severity]}  ${g.rule.name}  ${g.rule.id}  (${g.findings.length})`,
      );
      out.push(`       ${g.rule.url}`);
      const width = Math.max(...g.findings.map((f) => f.objectName.length));
      for (const f of g.findings) {
        const cols = [f.objectName.padEnd(width), locationOf(f), f.detail ?? ""].filter(
          (c, i) => i === 0 || c !== "",
        );
        out.push(`       ${cols.join("  ")}`.trimEnd());
      }
      out.push("");
    }
  }
  // Rule crashes are always reported, including on a run where nothing else fired.
  if (result.summary.ruleErrors.length) {
    out.push("Rule errors (please report these):");
    for (const e of result.summary.ruleErrors) out.push(`  ${e.id}: ${e.message}`);
    out.push("");
  }
  return out.join("\n");
}
