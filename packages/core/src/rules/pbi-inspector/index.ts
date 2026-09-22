import type { Rule } from "../types.js";
import { INSPECTOR_RULES } from "./inspector-rules.data.js";

const order = new Map(INSPECTOR_RULES.map((r, i) => [r.id, i]));

/** The pbi-inspector pack: every base rule, in ruleset order. Tasks 15 to 17 add the rule files. */
export const pbiInspectorRules: Rule[] = [].sort(
  (a: Rule, b: Rule) => order.get(a.id)! - order.get(b.id)!,
);
