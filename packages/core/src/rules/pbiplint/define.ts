import type { Project } from "../../project/types.js";
import { RULE_SUMMARIES } from "../rule-summaries.data.js";
import type {
  Category,
  Layer,
  LayerName,
  ObjectType,
  Rule,
  RuleContext,
  RuleFinding,
  RuleOption,
  RuleOptions,
  Severity,
} from "../types.js";

export interface PbiplintRuleSpec {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  scope: ObjectType[];
  layer: Layer;
  /** The layers the rule cannot run without, when they are not the ones its `layer` implies. */
  needs?: readonly LayerName[];
  /** True when the rule is skipped while a report file could not be read (Rule.needsEveryReportFileRead). */
  needsEveryReportFileRead?: boolean;
  options?: readonly RuleOption[];
  references?: string[];
  policySeverity?(options: RuleOptions): Severity | undefined;
  check(project: Project, ctx: RuleContext): RuleFinding[];
}

/**
 * One of pbiplint's own rules: built in, needing the layers its `layer` names unless it declares
 * its own, described by its page.
 */
export function pbiplintRule(spec: PbiplintRuleSpec): Rule {
  const { needs, options, references, policySeverity, ...rest } = spec;
  return {
    ...rest,
    needs: needs ?? (spec.layer === "project" ? ["model", "report"] : [spec.layer]),
    ...(options ? { options } : {}),
    ...(policySeverity ? { policySeverity } : {}),
    description: RULE_SUMMARIES[spec.id] ?? spec.name,
    references: references ?? [],
    status: "builtin",
  };
}
