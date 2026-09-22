import type { Ignorable } from "../rules/types.js";
import { unquoteValue } from "../tmdl/quote.js";

export const IGNORE_ANNOTATION = "pbiplint.ignore";

/**
 * True when the object carries `annotation pbiplint.ignore = RULE_A, RULE_B` naming this rule, or
 * `= *`. Ids are matched without regard to case, so a hand-typed lowercase id still works.
 */
export function isIgnored(object: Ignorable | undefined, ruleId: string): boolean {
  const raw = object?.annotations[IGNORE_ANNOTATION];
  if (raw === undefined) return false;
  const wanted = ruleId.toUpperCase();
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
 * imports nothing from core. A rule scoped to files alone has no object to annotate; a rule scoped
 * to report objects alone is ignored in the JSON of the pages or visuals it reaches, named as its
 * scope names them, and otherwise has nothing to annotate either. A scope with any model object
 * keeps the TMDL form, because its objects are model objects.
 */
export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
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
