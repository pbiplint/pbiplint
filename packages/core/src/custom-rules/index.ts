// The custom rules entry, @pbiplint/core/custom-rules: a team's own rule files read and run as
// rules. It is apart from the core's main entry, so lint never carries the evaluator and the site
// loads this only when a config names custom rules. The bundle check holds it to its own budget.
export { readCustomRules, teSeverity, type CustomRuleSet } from "./rules.js";
export { sameIdAs } from "../engine/custom.js";
export type { UpstreamRule } from "./te/upstream-rules.data.js";
export { LIMITS, type CustomRuleLimits } from "./limits.js";
export {
  runTeRules,
  STATISTICS_REASON,
  TOO_DEEP_REASON,
  TOO_LARGE_REASON,
  type TeOutcome,
  type TeRule,
  type TeRuleProblem,
  type TeRuleResult,
  type TeRunResult,
  type TomObject,
} from "./te/index.js";
// What a rule can use, for `pbiplint reference` and `pbiplint mcp`; the site does not import it.
export {
  teReference,
  typeLabel,
  type TeReference,
  type TeReferenceMember,
  type TeReferenceNotRun,
  type TeReferenceParam,
  type TeReferenceProperty,
} from "./te/reference.js";
