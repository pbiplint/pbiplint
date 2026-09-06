import {
  allMeasures,
  expressionObjects,
  finding,
  isBlank,
  type ExpressionKind,
} from "../helpers.js";
import type { Rule } from "../types.js";
import { bpaRule } from "./define.js";

const M: ExpressionKind = "measure";
const CC: ExpressionKind = "calculatedColumn";
const CI: ExpressionKind = "calculationItem";

/** A rule that flags every object in `kinds` whose expression matches any pattern. */
const patternRule = (id: string, kinds: ExpressionKind[], patterns: RegExp[]): Rule =>
  bpaRule(id, (m) =>
    expressionObjects(m, kinds)
      .filter((o) => patterns.some((p) => p.test(o.expression)))
      .map((o) => o.finding),
  );

export const PROVIDE_FORMAT_STRING_FOR_MEASURES = bpaRule(
  "PROVIDE_FORMAT_STRING_FOR_MEASURES",
  (m) =>
    allMeasures(m)
      .filter(
        (x) =>
          !x.isHidden &&
          !x.table.isHidden &&
          isBlank(x.formatString) &&
          isBlank(x.formatStringDefinition),
      )
      .map(finding.measure),
);

export const INTEGER_FORMATTING = bpaRule("INTEGER_FORMATTING", (m) =>
  allMeasures(m)
    .filter((x) => {
      const fs = x.formatString ?? "";
      return !fs.includes("$") && !fs.includes("%") && !(fs === "#,0" || fs === "#,0.0");
    })
    .map(finding.measure),
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

export const FILTER_COLUMN_VALUES = patternRule(
  "FILTER_COLUMN_VALUES",
  [M, CC, CI],
  [
    /CALCULATE\s*\(\s*[^,]+,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*\s*,\s*'*[A-Za-z0-9 _]+'*\[[A-Za-z0-9 _]+\]/i,
    /CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*,\s*'*[A-Za-z0-9 _]+'*\[[A-Za-z0-9 _]+\]/i,
  ],
);

export const FILTER_MEASURE_VALUES_BY_COLUMNS = patternRule(
  "FILTER_MEASURE_VALUES_BY_COLUMNS",
  [M, CC, CI],
  [
    /CALCULATE\s*\(\s*[^,]+,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*\s*,\s*\[[^\]]+\]/i,
    /CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*,\s*\[/i,
  ],
);

export const AVOID_USING_1_X_Y_SYNTAX = patternRule(
  "AVOID_USING_'1-(X/Y)'_SYNTAX",
  [M, CC, CI],
  [
    /[0-9]+\s*[-+]\s*[(]*\s*SUM\s*\(\s*'*[A-Za-z0-9 _]+'*\s*\[[A-Za-z0-9 _]+\]\s*\)\s*\//i,
    /[0-9]+\s*[-+]\s*DIVIDE\s*\(/i,
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

// The TMDL reader never yields an empty expression (the next indented line becomes the expression),
// so this rule can only fire on models built some other way. It is kept for completeness.
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
