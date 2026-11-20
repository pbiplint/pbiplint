import { unquoteValue } from "./quote.js";

/**
 * Tabular Editor's own ignore annotation, `{"RuleIDs": ["RULE_A", ...]}`. Many models carry it,
 * Microsoft's sample project among them, so pbiplint honours it for every rule as Tabular Editor
 * does: on an object for that object, on the model for every object in the model
 * (engine/ignore.ts). It lives here so the TMDL parser can report a malformed one.
 */
export const TE_IGNORE_ANNOTATION = "BestPracticeAnalyzer_IgnoreRules";

/**
 * The rule ids a `BestPracticeAnalyzer_IgnoreRules` value names, upper-cased, or undefined when the
 * value is not a JSON object whose `RuleIDs` (any case, as Tabular Editor reads it) is a list of
 * strings. A malformed value ignores nothing, and the parser reports it as a parse issue, where
 * Tabular Editor fails every rule whose scope covers the object.
 */
export function teIgnoreIds(raw: string): string[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(unquoteValue(raw));
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const list = Object.entries(value).find(([key]) => key.toLowerCase() === "ruleids")?.[1];
  if (!Array.isArray(list) || !list.every((id) => typeof id === "string")) return undefined;
  return list.map((id: string) => id.toUpperCase());
}
