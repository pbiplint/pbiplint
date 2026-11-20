import type { Ignorable } from "../rules/types.js";
import { unquoteValue } from "../tmdl/quote.js";

export const IGNORE_ANNOTATION = "pbiplint.ignore";

/**
 * Tabular Editor's own ignore annotation, `{"RuleIDs": ["RULE_A", ...]}`. Many models carry it,
 * Microsoft's sample project among them, so pbiplint honours it for every rule as Tabular Editor
 * does: on an object for that object, on the model for every object in the model.
 */
export const TE_IGNORE_ANNOTATION = "BestPracticeAnalyzer_IgnoreRules";

/**
 * The rule ids a `BestPracticeAnalyzer_IgnoreRules` value names, upper-cased, or undefined when the
 * value is not a JSON object whose `RuleIDs` (any case, as Tabular Editor reads it) is a list of
 * strings. A malformed value ignores nothing; PARSE_ISSUE reports it.
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

/** Whether the object's own Tabular Editor annotation names the rule. */
function teIgnores(object: Ignorable | undefined, wanted: string): boolean {
  const raw = object?.annotations[TE_IGNORE_ANNOTATION];
  return raw !== undefined && (teIgnoreIds(raw)?.includes(wanted) ?? false);
}

/**
 * True when the object carries `annotation pbiplint.ignore = RULE_A, RULE_B` naming this rule, or
 * `= *`, or Tabular Editor's `BestPracticeAnalyzer_IgnoreRules` naming it, on the object or on the
 * `model` given. Ids are matched without regard to case, so a hand-typed lowercase id still works.
 * `pbiplint.ignore` on the model ignores the model object alone, as it always has.
 */
export function isIgnored(
  object: Ignorable | undefined,
  ruleId: string,
  model?: Ignorable,
): boolean {
  const wanted = ruleId.toUpperCase();
  if (teIgnores(object, wanted) || teIgnores(model, wanted)) return true;
  const raw = object?.annotations[IGNORE_ANNOTATION];
  if (raw === undefined) return false;
  return unquoteValue(raw)
    .split(",")
    .map((s) => s.trim())
    .some((s) => s === "*" || s.toUpperCase() === wanted);
}

/** Report objects whose page.json or visual.json carries an `annotations` array an ignore can go in. */
const REPORT_ANNOTATED = new Set(["Page", "Visual"]);
/** The other report objects: a rule scoped to these alone is turned off for the project instead. */
const REPORT_ONLY = new Set(["Report", "Bookmark", "ReportMeasure"]);

/**
 * How to silence a rule, in Markdown, for the foot of a rule page's "When to ignore it" section
 * and for the SARIF help block. Written once so the two surfaces cannot drift. The site build
 * carries a copy (packages/web/src/build/pages.ts) that a test holds equal, because the build
 * imports nothing from core. A rule scoped to files alone has no object to annotate, nor has one
 * scoped to report measures alone, whose schema allows annotations pbiplint does not read, nor one
 * scoped to bookmarks alone, whose schema allows none; a rule scoped to report objects alone is
 * ignored in the JSON of the pages or visuals it reaches, named as its scope names them, and
 * otherwise has nothing to annotate either. A scope with any model object keeps the TMDL form,
 * because its objects are model objects.
 */
export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  if (scope.length > 0 && scope.every((s) => s === "ReportMeasure"))
    return `This rule reports on measures defined in the report, and pbiplint reads no annotation on them, so there is no object to annotate. ${project}`;
  if (scope.length > 0 && scope.every((s) => s === "Bookmark"))
    return `This rule reports on bookmarks, and a bookmark's file has no place for an annotation, so there is no object to annotate. ${project}`;
  const reportScoped =
    scope.length > 0 && scope.every((s) => REPORT_ANNOTATED.has(s) || REPORT_ONLY.has(s));
  const page = scope.includes("Page");
  const visual = scope.includes("Visual");
  if (reportScoped && (page || visual)) {
    const [object, file] =
      page && visual
        ? ["page or visual", "page.json or visual.json"]
        : page
          ? ["page", "page.json"]
          : ["visual", "visual.json"];
    return (
      `To ignore this rule on one ${object}, add \`{ "name": "${IGNORE_ANNOTATION}", "value": "${ruleId}" }\` to the ` +
      `\`annotations\` array of its ${file}. Power BI Desktop keeps the annotation. ${project}`
    );
  }
  if (reportScoped)
    return `This rule reports on the report itself, so there is no object to annotate. ${project}`;
  return (
    `To ignore this rule on one object, add \`annotation ${IGNORE_ANNOTATION} = ${ruleId}\` under ` +
    `the object in its TMDL file. Power BI Desktop keeps the annotation. ${project}`
  );
}
