import { ruleUrl, slug } from "../model/names.js";
import {
  CATEGORY_ORDER,
  type Category,
  type Finding,
  type Rule,
  type RuleStatus,
  type Severity,
} from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";

export interface RuleSummary {
  id: string;
  name: string;
  category: Category;
  /** Effective severity after config overrides. */
  severity: Severity;
  slug: string;
  url: string;
  status: RuleStatus;
}

export interface RankedGroup {
  rule: RuleSummary;
  findings: Finding[];
}

export const effectiveSeverity = (rule: Rule, config: ResolvedConfig): Severity =>
  config.severity.get(rule.id) ?? rule.severity;

export function summarizeRule(rule: Rule, config: ResolvedConfig): RuleSummary {
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    severity: effectiveSeverity(rule, config),
    slug: slug(rule.id),
    url: ruleUrl(rule.id),
    status: rule.status,
  };
}

/**
 * Group findings by rule and order the groups by severity (error first), category priority,
 * finding count (more first), then rule id. Findings inside a group keep model order.
 */
export function rank(findings: Finding[], rules: Rule[], config: ResolvedConfig): RankedGroup[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const groups = new Map<string, RankedGroup>();
  for (const f of findings) {
    let g = groups.get(f.ruleId);
    if (!g) {
      const rule = byId.get(f.ruleId);
      if (!rule) throw new Error(`Finding for unknown rule ${f.ruleId}`);
      g = { rule: summarizeRule(rule, config), findings: [] };
      groups.set(f.ruleId, g);
    }
    g.findings.push(f);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.rule.severity - a.rule.severity ||
      CATEGORY_ORDER.indexOf(a.rule.category) - CATEGORY_ORDER.indexOf(b.rule.category) ||
      b.findings.length - a.findings.length ||
      a.rule.id.localeCompare(b.rule.id),
  );
}
