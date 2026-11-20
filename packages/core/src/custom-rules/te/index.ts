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

/** Each rule's parsed expression, so a rule run on many models is parsed once. */
const parsedRules = new WeakMap<TeRule, ReturnType<typeof parseTeExpression>>();

/**
 * Runs one rule on the view. An expression that does not parse is the rule not running, with the
 * parser's reason; so is running out of stack, or building more than JavaScript holds.
 */
function runRule(rule: TeRule, view: TomView): TeOutcome {
  try {
    let parsed = parsedRules.get(rule);
    if (parsed === undefined) parsedRules.set(rule, (parsed = parseTeExpression(rule.expression)));
    if ("error" in parsed) return { kind: "could-not-run", reason: parsed.error };
    return evaluateTeRule(rule, parsed.expr, view);
  } catch (e) {
    const reason = engineLimitReason(e);
    if (reason === undefined) throw e;
    return { kind: "could-not-run", reason };
  }
}

/** Each model's runner, so every custom rule run on one model shares one view. */
const runners = new WeakMap<Model, (rule: TeRule) => TeOutcome>();

/**
 * What runs Tabular Editor rules on a model, one rule per call, as the engine runs custom rules:
 * the model's view is built on the first call and kept for the model, and each rule's expression
 * is parsed once.
 */
export function teRunner(model: Model): (rule: TeRule) => TeOutcome {
  let runner = runners.get(model);
  if (runner === undefined) {
    let view: TomView | undefined;
    runner = (rule) => runRule(rule, (view ??= buildTomView(model)));
    runners.set(model, runner);
  }
  return runner;
}

/**
 * Reads a Tabular Editor rule file and runs every rule in it on the model. The model's view is
 * built once for the whole file. A rule that cannot run is that rule's outcome; the file's other
 * rules still run.
 */
export function runTeRules(text: string, model: Model): TeRunResult {
  const file = readTeRuleFile(text);
  if ("error" in file) return { error: file.error };
  const view = buildTomView(model);
  const results = file.rules.map((rule): TeRuleResult => ({ rule, outcome: runRule(rule, view) }));
  return { results, problems: file.problems };
}
