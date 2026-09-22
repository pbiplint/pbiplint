import type { Rule } from "../types.js";
import { countRules } from "./counts.js";
import { INSPECTOR_RULES } from "./inspector-rules.data.js";
import { pageRules } from "./pages.js";
import { reportRules } from "./report.js";
import { visualRules } from "./visuals.js";

const order = new Map(INSPECTOR_RULES.map((r, i) => [r.id, i]));

/** The pbi-inspector pack: every base rule, in ruleset order. */
export const pbiInspectorRules: Rule[] = [
  ...countRules,
  ...reportRules,
  ...pageRules,
  ...visualRules,
].sort((a: Rule, b: Rule) => order.get(a.id)! - order.get(b.id)!);
