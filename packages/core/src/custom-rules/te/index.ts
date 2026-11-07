import type { Model } from "../../model/types.js";
import { evaluateTeRule, type TeOutcome } from "./evaluate.js";
import { parseTeExpression } from "./parser.js";
import { readTeRuleFile, type TeRule, type TeRuleProblem } from "./read.js";
import { buildTomView } from "./view.js";

export type { TeOutcome } from "./evaluate.js";
export type { TeRule, TeRuleProblem } from "./read.js";
export type { TomObject } from "./view-types.js";
export { STATISTICS_REASON } from "./library.js";

/** One rule of a file and what running it on the model gave. */
export interface TeRuleResult {
  rule: TeRule;
  outcome: TeOutcome;
}

/**
 * A Tabular Editor rule file run on a model: refused whole with a reason, or each rule it read with
 * its outcome, in file order, and the rules it could not read.
 */
export type TeRunResult =
  { error: string } | { results: TeRuleResult[]; problems: TeRuleProblem[] };

/**
 * Reads a Tabular Editor rule file and runs every rule in it on the model. Each expression is
 * parsed once, and one that does not parse is that rule not running, with the parser's reason; the
 * model's view is built once for the whole file.
 */
export function runTeRules(text: string, model: Model): TeRunResult {
  const file = readTeRuleFile(text);
  if ("error" in file) return { error: file.error };
  const view = buildTomView(model);
  const results = file.rules.map((rule): TeRuleResult => {
    const parsed = parseTeExpression(rule.expression);
    if ("error" in parsed)
      return { rule, outcome: { kind: "could-not-run", reason: parsed.error } };
    return { rule, outcome: evaluateTeRule(rule, parsed.expr, view) };
  });
  return { results, problems: file.problems };
}
