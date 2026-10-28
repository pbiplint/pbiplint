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
import { optionsFor } from "./run.js";

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

/** The config's severity for the rule, else what a policy rule's options raise it to, else its own. */
export const effectiveSeverity = (rule: Rule, config: ResolvedConfig): Severity =>
  config.severity.get(rule.id) ?? rule.policySeverity?.(optionsFor(rule, config)) ?? rule.severity;

/**
 * The layer a group of a rule's findings shows. A `project` rule reports on both layers, so its
 * group takes the layer its findings share. When they do not share one the group is the project's
 * own, and with no findings at all the rule's own layer stands. A group whose findings change
 * (`shareModels` drops some) is given its layer again from its `project` layer.
 */
export function groupLayer(layer: Layer, findings: readonly Finding[]): Layer {
  const first = findings[0];
  if (layer !== "project" || !first) return layer;
  return findings.every((f) => f.layer === first.layer) ? first.layer : "project";
}

/**
 * What a result says about a rule: its name, category, effective severity under `config`, layer,
 * and the address of its page. `findings` are the rule's own and matter only to a `project` rule,
 * whose layer is the one they share.
 */
export function summarizeRule(
  rule: Rule,
  config: ResolvedConfig,
  findings: Finding[] = [],
): RuleSummary {
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    severity: effectiveSeverity(rule, config),
    layer: groupLayer(rule.layer, findings),
    slug: slug(rule.id),
    url: ruleUrl(rule.id),
    status: rule.status,
  };
}

/**
 * Group findings by rule and order the groups by severity (error first), category priority,
 * finding count (more first), then rule id. Findings inside a group keep the order the rule
 * returned them in.
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
  return groups.sort(byRank);
}

/** The order `rank` gives groups, for a caller that changes how many findings a group holds. */
export const byRank = (a: RankedGroup, b: RankedGroup): number =>
  b.rule.severity - a.rule.severity ||
  CATEGORY_ORDER.indexOf(a.rule.category) - CATEGORY_ORDER.indexOf(b.rule.category) ||
  b.findings.length - a.findings.length ||
  a.rule.id.localeCompare(b.rule.id, "en");
