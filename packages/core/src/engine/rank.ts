import { ruleUrl, slug } from "../model/names.js";
import {
  CATEGORY_ORDER,
  type Category,
  type Finding,
  type Layer,
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
  /** The rule's layer; for a `project` rule, the layer of the objects its findings name. */
  layer: Layer;
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

export function summarizeRule(
  rule: Rule,
  config: ResolvedConfig,
  findings: Finding[] = [],
): RuleSummary {
  const layer = rule.layer === "project" && findings[0] ? findings[0].layer : rule.layer;
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    severity: effectiveSeverity(rule, config),
    layer,
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
  // The findings come first, because a `project` rule takes its group's layer from them.
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byId.has(f.ruleId)) throw new Error(`Finding for unknown rule ${f.ruleId}`);
    let fs = byRule.get(f.ruleId);
    if (!fs) byRule.set(f.ruleId, (fs = []));
    fs.push(f);
  }
  const groups: RankedGroup[] = [...byRule].map(([id, fs]) => ({
    rule: summarizeRule(byId.get(id)!, config, fs),
    findings: fs,
  }));
  return groups.sort(
    (a, b) =>
      b.rule.severity - a.rule.severity ||
      CATEGORY_ORDER.indexOf(a.rule.category) - CATEGORY_ORDER.indexOf(b.rule.category) ||
      b.findings.length - a.findings.length ||
      a.rule.id.localeCompare(b.rule.id, "en"),
  );
}
