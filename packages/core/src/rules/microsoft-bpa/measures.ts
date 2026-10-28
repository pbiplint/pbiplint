import { isPunctuation, isWord, tokenizeDax } from "../../dax/tokenize.js";
import {
  allMeasures,
  type ExpressionKind,
  expressionObjects,
  finding,
  isBlank,
  tablesPartlyRead,
} from "../helpers.js";
import type { Measure } from "../../model/types.js";
import type { Rule } from "../types.js";
import { type Matcher, opening } from "./dax-scan.js";
import { bpaRule } from "./define.js";

const M: ExpressionKind = "measure";
const CC: ExpressionKind = "calculatedColumn";
const CI: ExpressionKind = "calculationItem";

/** A rule that flags every object in `kinds` whose expression matches any pattern. */
const patternRule = (id: string, kinds: ExpressionKind[], patterns: Matcher[]): Rule =>
  bpaRule(id, (m) =>
    expressionObjects(m, kinds)
      .filter((o) => patterns.some((p) => p.test(o.expression)))
      .map((o) => o.finding),
  );

/** DAX functions that return text, for `returnsText`. */
const TEXT_FUNCTIONS = new Set([
  "FORMAT",
  "CONCATENATE",
  "CONCATENATEX",
  "UNICHAR",
  "COMBINEVALUES",
  "LEFT",
  "RIGHT",
  "MID",
  "UPPER",
  "LOWER",
  "SUBSTITUTE",
  "REPT",
  "TRIM",
  "FIXED",
  "REPLACE",
  "USERPRINCIPALNAME",
  "USERNAME",
  "USEROBJECTID",
  "USERCULTURE",
  "CUSTOMDATA",
  "SELECTEDMEASURENAME",
  "NAMEOF",
  "TOJSON",
  "TOCSV",
]);

/**
 * Whether a measure plainly returns text, as its tokens show it: the result, which is what follows
 * the last top-level `RETURN` or the whole expression when there is none, is a lone string, joins
 * values with a top-level `&`, or starts with a call to a function that returns text. Comments and
 * strings cannot mislead it. Text returned any other way, such as `MAXX` over a text column, is not
 * seen, since pbiplint does not work out a DAX expression's type.
 */
export function returnsText(expression: string): boolean {
  const tokens = tokenizeDax(expression);
  let from = 0;
  tokens.forEach((t, i) => {
    if (t.depth === 0 && isWord(t, "RETURN")) from = i + 1;
  });
  const result = tokens.slice(from);
  const first = result[0];
  if (first === undefined) return false;
  if (result.length === 1 && first.kind === "string") return true;
  if (result.some((t) => t.depth === 0 && t.kind === "operator" && t.text === "&")) return true;
  return (
    first.kind === "identifier" &&
    TEXT_FUNCTIONS.has(first.text.toUpperCase()) &&
    isPunctuation(result[1], "(")
  );
}

// A measure that plainly returns text is left out, which the source does not do: a documented
// deviation. Power BI sets no format string on text, and Tabular Editor 3's built-in version of
// the rule leaves out every measure it reads as text. A part of the measure's table pbiplint could
// not read may hide the table.
export const PROVIDE_FORMAT_STRING_FOR_MEASURES = bpaRule(
  "PROVIDE_FORMAT_STRING_FOR_MEASURES",
  { skipWhenModelUnread: tablesPartlyRead },
  (m) =>
    allMeasures(m)
      .filter(
        (x) =>
          !x.isHidden &&
          !x.table.isHidden &&
          isBlank(x.formatString) &&
          isBlank(x.formatStringDefinition) &&
          !returnsText(x.expression),
      )
      .map(finding.measure),
);

// The source rule reads only the static format string, so an unformatted currency or percentage
// measure fires under a name that calls it a whole number. The detail says what the rule saw.
const formatStringDetail = (x: Measure): string => {
  const fs = x.formatString ?? "";
  if (fs.trim() !== "") return `format string "${fs}"`;
  return isBlank(x.formatStringDefinition) ? "no format string" : "dynamic format string only";
};

export const INTEGER_FORMATTING = bpaRule("INTEGER_FORMATTING", (m) =>
  allMeasures(m)
    .filter((x) => {
      const fs = x.formatString ?? "";
      return !fs.includes("$") && !fs.includes("%") && !(fs === "#,0" || fs === "#,0.0");
    })
    .map((x) => ({ ...finding.measure(x), detail: formatStringDetail(x) })),
);

export const PERCENTAGE_FORMATTING = bpaRule("PERCENTAGE_FORMATTING", (m) =>
  allMeasures(m)
    .filter(
      (x) => (x.formatString ?? "").includes("%") && x.formatString !== "#,0.0%;-#,0.0%;#,0.0%",
    )
    .map(finding.measure),
);

export const USE_THE_DIVIDE_FUNCTION_FOR_DIVISION = patternRule(
  "USE_THE_DIVIDE_FUNCTION_FOR_DIVISION",
  [M, CC, CI],
  [/\]\s*\/(?!\/)(?!\*)/, /\)\s*\/(?!\/)(?!\*)/],
);

export const AVOID_USING_THE_IFERROR_FUNCTION = patternRule(
  "AVOID_USING_THE_IFERROR_FUNCTION",
  [M, CC],
  [/IFERROR\s*\(/i],
);

export const USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT = patternRule(
  "USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT",
  [M, CI],
  [/INTERSECT\s*\(/i],
);

// The source patterns below are rewritten so no two parts next to each other can match the same
// space, and each matches the same text as its source pattern. As written, `\s*'*[A-Za-z0-9 _]+'*\s*`
// backtracked by the cube of a run of spaces, and `[0-9]+` at the start by the square of a run of
// digits (the pre-release security review, October 27, 2026).
/** The source's `\s*'*[A-Za-z0-9 _]+`: a run of spaces is the name's, not the `\s*`'s. */
const NAME = String.raw`(?:\s*'+|(?:\s*[^\S ])?)[A-Za-z0-9 _]+`;
/** The source's `'*\s*` after `NAME`. */
const NAME_END = String.raw`(?:'+\s*|[^\S ]\s*)?`;
const COLUMN = String.raw`'*\[[A-Za-z0-9 _]+\]`;
const pattern = (source: string): RegExp => new RegExp(source, "i");
// The four CALCULATE patterns are read by `opening` (dax-scan.ts): as a regex, a search started
// again at every CALCULATE and read on to the same comma, the square of a run with none.
const CALCULATE = /CALCULATE\s*\(/gi;
const CALCULATETABLE = /CALCULATETABLE\s*\(/gi;

export const FILTER_COLUMN_VALUES = patternRule(
  "FILTER_COLUMN_VALUES",
  [M, CC, CI],
  [
    // CALCULATE\s*\(\s*[^,]+,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*\s*,\s*'*[A-Za-z0-9 _]+'*\[[A-Za-z0-9 _]+\]
    // As a regex: CALCULATE\s*\([^,]+,\s*FILTER\s*\(${NAME}${NAME_END},${NAME}${COLUMN}
    opening(CALCULATE, false, String.raw`\s*FILTER\s*\(${NAME}${NAME_END},${NAME}${COLUMN}`),
    // CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*,\s*'*[A-Za-z0-9 _]+'*\[[A-Za-z0-9 _]+\]
    // As a regex: CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(${NAME}'*,${NAME}${COLUMN}
    opening(CALCULATETABLE, true, String.raw`\s*FILTER\s*\(${NAME}'*,${NAME}${COLUMN}`),
  ],
);

export const FILTER_MEASURE_VALUES_BY_COLUMNS = patternRule(
  "FILTER_MEASURE_VALUES_BY_COLUMNS",
  [M, CC, CI],
  [
    // CALCULATE\s*\(\s*[^,]+,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*\s*,\s*\[[^\]]+\]
    // As a regex: CALCULATE\s*\([^,]+,\s*FILTER\s*\(${NAME}${NAME_END},\s*\[[^\]]+\]
    opening(CALCULATE, false, String.raw`\s*FILTER\s*\(${NAME}${NAME_END},\s*\[`, true),
    // CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*,\s*\[
    // As a regex: CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(${NAME}'*,\s*\[
    opening(CALCULATETABLE, true, String.raw`\s*FILTER\s*\(${NAME}'*,\s*\[`),
  ],
);

export const AVOID_USING_1_X_Y_SYNTAX = patternRule(
  "AVOID_USING_'1-(X/Y)'_SYNTAX",
  [M, CC, CI],
  [
    // [0-9]+\s*[-+]\s*[(]*\s*SUM\s*\(\s*'*[A-Za-z0-9 _]+'*\s*\[[A-Za-z0-9 _]+\]\s*\)\s*\/
    pattern(
      String.raw`[0-9]\s*[-+]\s*(?:\(+\s*)?SUM\s*\(${NAME}${NAME_END}\[[A-Za-z0-9 _]+\]\s*\)\s*\/`,
    ),
    // [0-9]+\s*[-+]\s*DIVIDE\s*\(
    /[0-9]\s*[-+]\s*DIVIDE\s*\(/i,
  ],
);

export const EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS = patternRule(
  "EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS",
  [M],
  [/EVALUATEANDLOG\s*\(/i],
);

export const REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION = patternRule(
  "REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION",
  [CC],
  [/RELATED\s*\(/i],
);

// A declaration whose `=` is followed by nothing, and whose next non-blank line is indented no
// deeper than the declaration itself, yields an empty expression, so this rule fires on such a file.
export const EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION = bpaRule(
  "EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION",
  (m) =>
    expressionObjects(m, [M, CC, CI])
      .filter((o) => isBlank(o.expression))
      .map((o) => o.finding),
);

export const measureRules = [
  PROVIDE_FORMAT_STRING_FOR_MEASURES,
  INTEGER_FORMATTING,
  PERCENTAGE_FORMATTING,
  USE_THE_DIVIDE_FUNCTION_FOR_DIVISION,
  AVOID_USING_THE_IFERROR_FUNCTION,
  USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT,
  FILTER_COLUMN_VALUES,
  FILTER_MEASURE_VALUES_BY_COLUMNS,
  AVOID_USING_1_X_Y_SYNTAX,
  EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS,
  REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION,
  EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION,
];
