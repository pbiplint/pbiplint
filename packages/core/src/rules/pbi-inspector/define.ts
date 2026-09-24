import type { Report } from "../../pbir/types.js";
import { RULE_SUMMARIES } from "../rule-summaries.data.js";
import type { Category, ObjectType, Rule, RuleContext, RuleFinding, RuleOption } from "../types.js";
import { INSPECTOR_RULES, type InspectorRuleMeta } from "./inspector-rules.data.js";

const byId = new Map(INSPECTOR_RULES.map((r) => [r.id, r]));

export const inspectorMetaOf = (id: string): InspectorRuleMeta => {
  const meta = byId.get(id);
  if (!meta) throw new Error(`Unknown PBI Inspector rule id: ${id}`);
  return meta;
};

export interface InspectorRuleSpec {
  /** The source has no categories; the v2 spec (section 8.5) assigns them. */
  category: Category;
  scope: ObjectType[];
  options?: RuleOption[];
}

/**
 * A port of one fab-inspector base rule: the id and name from the vendored ruleset, the category,
 * scope, and options from the spec, the description from the rule page, the behaviour from
 * `check`. Every port is a warning, as the source's CLI reports them. The four deviations from
 * the source are named on the pages and in the rules' doc comments; those a fixture shows are
 * pinned by `ours` in the expectation files, the others by the rules' unit tests.
 */
export function inspectorRule(
  id: string,
  { category, scope, options }: InspectorRuleSpec,
  check: (report: Report, ctx: RuleContext) => RuleFinding[],
): Rule {
  const meta = inspectorMetaOf(id);
  return {
    id,
    name: meta.name,
    category,
    severity: 2,
    scope,
    layer: "report",
    needs: ["report"],
    ...(options ? { options } : {}),
    description: RULE_SUMMARIES[id] ?? meta.name,
    references: [],
    status: "ported",
    check: (project, ctx) => (project.report ? check(project.report, ctx) : []),
  };
}
