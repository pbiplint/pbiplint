import type { Named } from "../model/types.js";
import { unquoteValue } from "../tmdl/quote.js";

export const IGNORE_ANNOTATION = "pbiplint.ignore";

/**
 * True when the object carries `annotation pbiplint.ignore = RULE_A, RULE_B` naming this rule, or
 * `= *`. Ids are matched without regard to case, so a hand-typed lowercase id still works.
 */
export function isIgnored(object: Named | undefined, ruleId: string): boolean {
  const raw = object?.annotations[IGNORE_ANNOTATION];
  if (raw === undefined) return false;
  const wanted = ruleId.toUpperCase();
  return unquoteValue(raw)
    .split(",")
    .map((s) => s.trim())
    .some((s) => s === "*" || s.toUpperCase() === wanted);
}
