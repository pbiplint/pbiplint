import type { ResolvedConfig } from "./config.js";
import type { LintResult } from "./lint.js";

/**
 * The result kept to the given rules' findings, for a caller that shows one rule at a time. Every
 * rule still ran; `summary.shown` counts what is kept, the rest of the summary stays the whole
 * run's, and `failed` follows the kept findings, so the exit matches what is shown.
 */
export function showOnly(
  result: LintResult,
  ruleIds: readonly string[],
  config: ResolvedConfig,
): LintResult {
  const keep = new Set(ruleIds);
  const groups = result.groups.filter((g) => keep.has(g.rule.id));
  const count = (severity: number) =>
    groups.filter((g) => g.rule.severity === severity).reduce((n, g) => n + g.findings.length, 0);
  return {
    ...result,
    groups,
    findings: result.findings.filter((f) => keep.has(f.ruleId)),
    summary: {
      ...result.summary,
      shown: {
        rules: [...keep],
        findings: groups.reduce((n, g) => n + g.findings.length, 0),
        errors: count(3),
        warnings: count(2),
        infos: count(1),
      },
    },
    failed: config.failOn !== null && groups.some((g) => g.rule.severity >= config.failOn!),
  };
}
