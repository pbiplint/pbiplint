import { ruleUrl, slug } from "../model/names.js";
import {
  CATEGORY_ORDER,
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
  category: string;
  /** Effective severity after config overrides. */
  severity: Severity;
  /** The rule's layer; for a `project` rule, the layer of the objects its findings name. */
  layer: Layer;
  slug: string;
  url: string;
  status: RuleStatus;
  /** Set, as true, for a team's own rule only, with `ruleFile` and `description`. */
  custom?: true;
  /** A custom rule's file, as the config's `customRules` names it. */
  ruleFile?: string;
  /** A custom rule's description, which stands in for a rule page. */
  description?: string;
}

/** Where a custom rule's `url` points: the page on custom rules, since it has no page of its own. */
export const CUSTOM_RULES_URL = "https://pbiplint.com/custom-rules/";

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
    url: rule.custom ? CUSTOM_RULES_URL : ruleUrl(rule.id),
    status: rule.status,
    ...(rule.custom && {
      custom: true as const,
      ruleFile: rule.custom.file,
      description: rule.description,
    }),
  };
}

/**
 * Group findings by rule and order the groups by severity (error first), category priority,
 * finding count (more first), then rule id. Findings inside a group keep the order the rule
 * returned them in.
 */
export function rank(findings: Finding[], rules: Rule[], config: ResolvedConfig): RankedGroup[] {
  // The first rule with an id names the group: pbiplint's own rules come before custom ones, so a
  // custom rule refused for taking a safety net's id never stands in for it.
  const byId = new Map<string, Rule>();
  for (const r of rules) if (!byId.has(r.id)) byId.set(r.id, r);
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

/**
 * Where a category ranks: pbiplint's own categories by their place in `CATEGORY_ORDER`, and every
 * other category, a custom rule's own, after them all, level with each other.
 */
export function categoryRank(category: string): number {
  const at = (CATEGORY_ORDER as readonly string[]).indexOf(category);
  return at === -1 ? CATEGORY_ORDER.length : at;
}

/**
 * The order `rank` gives groups, for a caller that changes how many findings a group holds:
 * severity, then pbiplint's categories in order, then custom categories alphabetically, then
 * count, then id.
 */
export function byRank(a: RankedGroup, b: RankedGroup): number {
  const ca = categoryRank(a.rule.category);
  const cb = categoryRank(b.rule.category);
  return (
    b.rule.severity - a.rule.severity ||
    ca - cb ||
    (ca === CATEGORY_ORDER.length ? a.rule.category.localeCompare(b.rule.category, "en") : 0) ||
    b.findings.length - a.findings.length ||
    a.rule.id.localeCompare(b.rule.id, "en")
  );
}
