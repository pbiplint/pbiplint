import type { Model } from "../../model/types.js";
import { evaluateTeRule, type TeOutcome } from "./evaluate.js";
import { parseTeExpression } from "./parser.js";
import { readTeRuleFile, type TeRule, type TeRuleProblem } from "./read.js";
import { buildTomView, type TomView } from "./view.js";

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
 * Why a rule could not run when its expression is chained so long (thousands of `+` or `and` in a
 * row) that walking it runs out of stack, which no nesting limit catches.
 */
export const TOO_DEEP_REASON =
  "the expression is too deeply chained to run; split it into smaller rules";

/** Why a rule could not run when it builds a value longer than JavaScript holds. */
export const TOO_LARGE_REASON =
  "the expression builds a value too large to run; split it into smaller rules";

/**
 * The reason for an engine's own error that ends one rule: running out of stack (a RangeError, or
 * Firefox's InternalError) or building a string or array past the engine's limit (a RangeError).
 */
function engineLimitReason(e: unknown): string | undefined {
  if (e instanceof RangeError)
    return /stack|recursion/i.test(e.message) ? TOO_DEEP_REASON : TOO_LARGE_REASON;
  if (e instanceof Error && e.name === "InternalError") return TOO_DEEP_REASON;
  return undefined;
}

function runRule(rule: TeRule, view: TomView): TeOutcome {
  const parsed = parseTeExpression(rule.expression);
  if ("error" in parsed) return { kind: "could-not-run", reason: parsed.error };
  return evaluateTeRule(rule, parsed.expr, view);
}

/**
 * Reads a Tabular Editor rule file and runs every rule in it on the model. Each expression is
 * parsed once, and one that does not parse is that rule not running, with the parser's reason; the
 * model's view is built once for the whole file. A rule that runs out of stack, or builds more
 * than JavaScript holds, is that rule not running; the file's other rules still run.
 */
export function runTeRules(text: string, model: Model): TeRunResult {
  const file = readTeRuleFile(text);
  if ("error" in file) return { error: file.error };
  const view = buildTomView(model);
  const results = file.rules.map((rule): TeRuleResult => {
    try {
      return { rule, outcome: runRule(rule, view) };
    } catch (e) {
      const reason = engineLimitReason(e);
      if (reason === undefined) throw e;
      return { rule, outcome: { kind: "could-not-run", reason } };
    }
  });
  return { results, problems: file.problems };
}
