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
  fileBytes: 1_048_576,
  rulesPerFile: 2_000,
  expressionChars: 20_000,
  nesting: 100,
  patternChars: 4_000,
  patternStates: 10_000,
  stepsPerRule: 20_000_000,
};
