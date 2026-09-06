import type { Named } from "../model/types.js";
import { unquoteValue } from "../tmdl/quote.js";

export const IGNORE_ANNOTATION = "pbiplint.ignore";

/** True when the object carries `annotation pbiplint.ignore = RULE_A, RULE_B` naming this rule, or `= *`. */
export function isIgnored(object: Named | undefined, ruleId: string): boolean {
  const raw = object?.annotations[IGNORE_ANNOTATION];
  if (raw === undefined) return false;
  const items = unquoteValue(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.includes("*") || items.includes(ruleId);
}
