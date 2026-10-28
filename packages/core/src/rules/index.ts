import { microsoftBpaRules } from "./microsoft-bpa/index.js";
import { PARSE_ISSUE } from "./parse-issue.js";
import { pbiInspectorRules } from "./pbi-inspector/index.js";
import { pbiplintRules } from "./pbiplint/index.js";
import { RULE_COULD_NOT_FINISH } from "./rule-could-not-finish.js";
import type { Rule } from "./types.js";

export const defaultRules: Rule[] = [
  PARSE_ISSUE,
  RULE_COULD_NOT_FINISH,
  ...microsoftBpaRules,
  ...pbiInspectorRules,
  ...pbiplintRules,
];
