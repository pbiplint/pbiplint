import type { LintResult } from "../engine/lint.js";
import type { RankedGroup } from "../engine/rank.js";
import type { SkippedRule } from "../engine/run.js";
import type { LayerStatus } from "../project/types.js";
import { SEVERITY_LABEL, type Finding, type Layer } from "../rules/types.js";

/** Guidance for one rule in the two forms SARIF carries: plain text and Markdown. */
export interface RuleHelp {
  text: string;
  markdown: string;
}

export interface FormatOptions {
  toolVersion?: string;
  /**
   * Help per rule id for the SARIF help block, which code scanning shows beside each alert.
   * The CLI passes the rule pages' Why, How to fix, and Quirks sections. Without it the block
   * falls back to the rule's description and page URL.
   */
  help?: Readonly<Record<string, RuleHelp>>;
  rules?: import("../rules/types.js").Rule[];
  /**
   * Posix path (forward slashes, no leading "./", no trailing slash) joined in front of a model
   * finding's SARIF artifact URI so code scanning can resolve it from the repository root. The
   * text, JSON, and markdown formats ignore both prefixes: each finding's path there stays
   * relative to its part's root, the model's or the report's.
   */
  pathPrefix?: string;
  /** The report's prefix, joined in front of a report finding's SARIF artifact URI; falls back to pathPrefix. */
  reportPathPrefix?: string;
}

const SEVERITY_TAG = { 3: "ERROR", 2: "WARN ", 1: "INFO " } as const;

export const locationOf = (f: Finding): string =>
  f.location ? `${f.location.file}:${f.location.line}` : "";

/** "1 rule", "2 rules". Nouns that do not take an s ("info") are written out by the caller. */
export const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Summary sentence shared by the text and markdown formats. */
export function summaryLine(result: LintResult): string {
  const s = result.summary;
  return `${plural(s.findings, "finding")} (${plural(s.errors, "error")}, ${plural(s.warnings, "warning")}, ${s.infos} info) in ${plural(s.files, "file")}`;
}

export function skippedLine(result: LintResult): string {
  const s = result.summary;
  const by = (reason: SkippedRule["reason"]): number =>
    s.rulesSkipped.filter((r) => r.reason === reason).length;
  const parts = [`${plural(s.rulesRun, "rule")} run`];
  if (by("needsLiveModel"))
    parts.push(`${plural(by("needsLiveModel"), "rule")} skipped (need a live model)`);
  // An absent layer's reason is the one the run recorded, so an overridden reason ("this report
  // reads a published model") reaches the reader here, where the layers line no longer names it.
  const why = (layer: LayerStatus, fallback: string): string =>
    layer.present ? fallback : layer.reason;
  if (by("noModel"))
    parts.push(
      `${plural(by("noModel"), "rule")} skipped (${why(result.layers.model, "no model in the input")})`,
    );
  if (by("noReport"))
    parts.push(
      `${plural(by("noReport"), "rule")} skipped (${why(result.layers.report, "no report in the input")})`,
    );
  if (by("disabled")) parts.push(`${plural(by("disabled"), "rule")} disabled by config`);
  if (s.ignored) parts.push(`${plural(s.ignored, "finding")} ignored by annotation`);
  return parts.join(", ");
}

/**
 * "Model: 11 files. Report: 27 files.", naming present layers only, so a run given one part says
 * nothing about the part it was not given; the reason for an absent layer rides on the skipped
 * line instead. Empty when neither layer is present.
 */
export function layersLine(result: LintResult): string {
  const part = (name: string, s: LayerStatus): string =>
    s.present ? `${name}: ${plural(s.files, "file")}.` : "";
  return [part("Model", result.layers.model), part("Report", result.layers.report)]
    .filter(Boolean)
    .join(" ");
}

export const layerTag = (layer: Layer): string => `[${layer}]`;

/** The facts as aligned lines under a heading, with rule ids in the right margin; nothing when there are no facts. */
export function factsLines(result: LintResult): string[] {
  if (result.facts.length === 0) return [];
  const rows = result.facts.map((f) => ({
    label: f.label,
    value: f.detail ? `${f.value} (${f.detail})` : f.value,
    rule: f.ruleId ?? "",
  }));
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const valueWidth = Math.max(...rows.map((r) => r.value.length));
  return [
    "Report at a glance",
    ...rows.map((r) =>
      `  ${r.label.padEnd(labelWidth)}  ${r.value.padEnd(valueWidth)}   ${r.rule}`.trimEnd(),
    ),
    "",
  ];
}

export const noticeLines = (result: LintResult): string[] =>
  result.diagnostics.map((d) => `Notice: ${d.message}`);

export const topGroups = (result: LintResult, n = 5): RankedGroup[] => result.groups.slice(0, n);

export function formatText(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [
    `pbiplint: ${summaryLine(result)}`,
    [layersLine(result), skippedLine(result)].filter(Boolean).join(" "),
    ...noticeLines(result),
    "",
    ...factsLines(result),
  ];
  if (result.groups.length === 0) {
    out.push("No findings.", "");
  } else {
    out.push("Fix these first:");
    topGroups(result).forEach((g, i) =>
      out.push(
        `  ${i + 1}. ${g.rule.name}  (${plural(g.findings.length, SEVERITY_LABEL[g.rule.severity])})   ${layerTag(g.rule.layer)}`,
      ),
    );
    out.push("");
    for (const g of result.groups) {
      out.push(
        `${SEVERITY_TAG[g.rule.severity]}  ${layerTag(g.rule.layer).padEnd(9)}  ${g.rule.name}  ${g.rule.id}  (${g.findings.length})`,
      );
      out.push(`       ${g.rule.url}`);
      // The location column is always emitted, empty or not, so a finding without a location never
      // shifts its detail into the location column. Widths align within the group only.
      const width = Math.max(...g.findings.map((f) => f.objectName.length));
      const locWidth = Math.max(...g.findings.map((f) => locationOf(f).length));
      for (const f of g.findings) {
        const cols = [f.objectName.padEnd(width), locationOf(f).padEnd(locWidth), f.detail ?? ""];
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
