import { RULE_SUMMARIES } from "./rule-summaries.data.js";
import type { Finding, Rule } from "./types.js";

/**
 * Built-in rule for a rule that ran and could not finish on an object or query (issue #238). Its
 * check returns nothing: `runRules` writes its findings from the rule errors, after every rule has
 * run, when this rule is among those that ran, so its config and `pbiplint.ignore` work as for any
 * rule. Each finding names the failed rule's id first in its detail
 * (`LOCAL_DRIVE_PATH could not finish on query 'Sales': TypeError`).
 */
export const RULE_COULD_NOT_FINISH: Rule = {
  id: "RULE_COULD_NOT_FINISH",
  name: "Rule could not finish",
  category: "Error Prevention",
  severity: 3,
  // Every object a finding can name; Table is a refresh policy's query.
  scope: ["Model", "Table", "Partition", "NamedExpression", "Report"],
  layer: "project",
  needs: [],
  description: RULE_SUMMARIES["RULE_COULD_NOT_FINISH"] ?? "Rule could not finish",
  references: [],
  status: "builtin",
  check: () => [],
};

/** How every finding's detail begins: the failed rule's id, then where it could not finish. */
const failurePrefix = (ruleId: string): string => `${ruleId} could not finish on `;

/**
 * A finding's detail: the rule `ruleId` could not finish on `label` (`query 'Sales'`, `the model`)
 * with an error of class `kind`. Written only here, so `isFailureOf` reads what `runRules` writes.
 */
export const failureDetail = (ruleId: string, label: string, kind: string): string =>
  `${failurePrefix(ruleId)}${label}: ${kind}`;

/** True when `f` is a RULE_COULD_NOT_FINISH finding about the rule `ruleId`, which failed. */
export const isFailureOf = (f: Finding, ruleId: string): boolean =>
  f.ruleId === RULE_COULD_NOT_FINISH.id && (f.detail?.startsWith(failurePrefix(ruleId)) ?? false);

/**
 * True when `f` is the finding `runRules` wrote for the rule error `e`: the error's message is the
 * label and class (`query 'Sales': TypeError`), or the class alone when the whole check threw, on
 * the model or the report.
 */
export const isFindingFor = (f: Finding, e: { id: string; message: string }): boolean =>
  f.ruleId === RULE_COULD_NOT_FINISH.id &&
  (f.detail === `${failurePrefix(e.id)}${e.message}` ||
    f.detail === failureDetail(e.id, "the model", e.message) ||
    f.detail === failureDetail(e.id, "the report", e.message));
