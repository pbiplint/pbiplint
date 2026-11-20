// What the engine knows of custom rules: the set `lint` takes and the error a custom rule throws
// when it cannot run. The reader and the evaluator live in the custom rules entry
// (@pbiplint/core/custom-rules), which builds the set; nothing here reaches them, so the core's
// main entry never carries the evaluator.
import type { Diagnostic } from "../project/types.js";
import type { Rule } from "../rules/types.js";

/** A project's custom rules, as `readCustomRules` builds them from the files its config names. */
export interface CustomRuleSet {
  /** Each file in `customRules` order, with the rule ids it holds as written, each once. */
  files: { path: string; ids: string[] }[];
  /** The rules, each a `Rule` with `status: "custom"`, in file order. */
  rules: Rule[];
  /** What reading the files found that a reader of the results must know, such as a duplicate id. */
  notices: Diagnostic[];
}

// A mark the engine checks rather than the class, so a stop thrown by a separately loaded copy of
// the custom rules entry (the site loads it as its own bundle) is still known for what it is.
const STOP = Symbol.for("pbiplint.customRuleStop");

/**
 * Thrown by a custom rule's check when the rule cannot run. `reason` is written for whoever fixes
 * the rule file and never quotes the model; the engine reports it, with the rule's file, as the
 * rule's one RULE_COULD_NOT_FINISH finding.
 */
export class CustomRuleStop extends Error {
  readonly [STOP] = true;
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "CustomRuleStop";
    this.reason = reason;
  }
}

export const isCustomRuleStop = (e: unknown): e is CustomRuleStop =>
  typeof e === "object" &&
  e !== null &&
  (e as Record<symbol, unknown>)[STOP] === true &&
  typeof (e as { reason?: unknown }).reason === "string";
