import { RULE_FILE_BYTES } from "../engine/custom.js";

/** The most a custom rule file, a rule, and a rule's regular expressions may ask of pbiplint. */
export interface CustomRuleLimits {
  /** A rule file's size in UTF-8 bytes. */
  fileBytes: number;
  /** Rules read from one file; the rest are reported. */
  rulesPerFile: number;
  /** An expression's length in characters. */
  expressionChars: number;
  /** How deeply an expression may nest. */
  nesting: number;
  /** A regular expression's length in characters. */
  patternChars: number;
  /** The states a regular expression may compile to. */
  patternStates: number;
  /** The evaluation steps one rule may take over the whole model. */
  stepsPerRule: number;
}

/**
 * The limits (custom rules spec, section 6.5). Over the survey's 46 rule files the largest file is
 * 64 KB and the longest expression 2,971 characters, so each limit leaves wide room for real files
 * while keeping a hostile one from stalling a run or the browser.
 */
export const LIMITS: CustomRuleLimits = {
  fileBytes: RULE_FILE_BYTES,
  rulesPerFile: 2_000,
  expressionChars: 20_000,
  nesting: 100,
  patternChars: 4_000,
  patternStates: 10_000,
  stepsPerRule: 20_000_000,
};

/** What each limit holds, and what happens past it, in a line each, for the reference. */
export const LIMIT_DESCRIPTIONS: Record<keyof CustomRuleLimits, string> = {
  fileBytes:
    "The most bytes a rule file may hold; a larger file stops the project's lint, naming it.",
  rulesPerFile: "The most rules read from one file; each rule after that is reported as not read.",
  expressionChars: "The longest Expression, in characters; a longer one is reported as not read.",
  nesting:
    "How deeply an Expression, or the groups of a regular expression, may nest; deeper stops the rule.",
  patternChars: "The longest regular expression, in characters; a longer one stops the rule.",
  patternStates:
    "The most states a regular expression may compile to; large repeat counts such as `{1000}` reach it, and it stops the rule.",
  stepsPerRule:
    "The evaluation steps one rule may take over the whole model, regular expressions included; a rule that reaches it stops.",
};
