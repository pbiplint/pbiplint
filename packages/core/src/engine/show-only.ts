import { isFailureOf } from "../rules/rule-could-not-finish.js";
import type { Finding } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import type { LintResult, ShownSummary } from "./lint.js";
import type { RankedGroup } from "./rank.js";

/** A result's finding counts by severity, as the summary gives them. */
export type FindingCounts = Omit<ShownSummary, "rules">;

/** The findings in `groups`, counted by their group's severity. */
export const countGroups = (groups: readonly RankedGroup[]): FindingCounts => {
  const count = (severity: number) =>
    groups.filter((g) => g.rule.severity === severity).reduce((n, g) => n + g.findings.length, 0);
  return {
    findings: groups.reduce((n, g) => n + g.findings.length, 0),
    errors: count(3),
    warnings: count(2),
    infos: count(1),
  };
};

/**
 * The result kept to `groups`, a subset of its own groups (each group's findings a subset of its
 * own): its findings are those the groups hold, and `failed` follows them, so the exit matches
 * what is kept. The summary is the caller's to change. `showOnly` and `shareModels` both keep
 * part of a result this way.
 */
export function recount(
  result: LintResult,
  groups: RankedGroup[],
  config: ResolvedConfig,
): LintResult {
  const kept = new Set(groups.flatMap((g) => g.findings));
  return {
    ...result,
    groups,
    findings: result.findings.filter((f) => kept.has(f)),
    failed: config.failOn !== null && groups.some((g) => g.rule.severity >= config.failOn!),
  };
}

/**
 * The result kept to the given rules' findings, for a caller that shows one rule at a time. Every
 * rule still ran; `summary.shown` counts what is kept, the rest of the summary stays the whole
 * run's, and `failed` follows the kept findings, so the exit matches what is shown. A
 * RULE_COULD_NOT_FINISH finding about a kept rule is one of that rule's own outcomes, so it is kept
 * too (pb-coord, October 28, 2026).
 */
export function showOnly(
  result: LintResult,
  ruleIds: readonly string[],
  config: ResolvedConfig,
): LintResult {
  const keep = new Set(ruleIds);
  const kept = (f: Finding): boolean =>
    keep.has(f.ruleId) || ruleIds.some((id) => isFailureOf(f, id));
  const groups = result.groups.flatMap((g) => {
    if (keep.has(g.rule.id)) return [g];
    const findings = g.findings.filter(kept);
    return findings.length ? [{ ...g, findings }] : [];
  });
  return {
    ...recount(result, groups, config),
    summary: {
      ...result.summary,
      shown: {
        // A kept failure belongs to a rule named here, but sits in RULE_COULD_NOT_FINISH's group, so
        // that id is listed too whenever such a group is shown.
        rules: [...new Set([...keep, ...groups.map((g) => g.rule.id)])],
        ...countGroups(groups),
      },
    },
  };
}
