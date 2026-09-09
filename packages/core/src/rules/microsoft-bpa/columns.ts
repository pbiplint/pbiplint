import type { Column, Model } from "../../model/types.js";
import {
  allColumns,
  allMeasures,
  allTablePermissions,
  dataType,
  escapeRegExp,
  finding,
  hiddenOrTableHidden,
  isBlank,
  isNumericType,
} from "../helpers.js";
import type { RuleContext, RuleFinding } from "../types.js";
import { bpaRule } from "./define.js";

const columns = (m: Model, pred: (c: Column) => boolean): RuleFinding[] =>
  allColumns(m).filter(pred).map(finding.column);

export const AVOID_FLOATING_POINT_DATA_TYPES = bpaRule("AVOID_FLOATING_POINT_DATA_TYPES", (m) =>
  columns(m, (c) => dataType(c) === "double"),
);

export const DATECOLUMN_FORMATSTRING = bpaRule("DATECOLUMN_FORMATSTRING", (m) =>
  columns(
    m,
    (c) =>
      /date/i.test(c.name) && dataType(c) === "datetime" && (c.formatString ?? "") !== "mm/dd/yyyy",
  ),
);

export const MONTHCOLUMN_FORMATSTRING = bpaRule("MONTHCOLUMN_FORMATSTRING", (m) =>
  columns(
    m,
    (c) =>
      /month/i.test(c.name) && dataType(c) === "datetime" && (c.formatString ?? "") !== "MMMM yyyy",
  ),
);

export const ADD_DATA_CATEGORY_FOR_COLUMNS = bpaRule("ADD_DATA_CATEGORY_FOR_COLUMNS", (m) =>
  columns(m, (c) => {
    const n = c.name.toLowerCase();
    const d = dataType(c);
    return (
      isBlank(c.dataCategory) &&
      (((n.includes("country") || n.includes("continent") || n.includes("city")) &&
        d === "string") ||
        ((n === "latitude" || n === "longitude") && (d === "decimal" || d === "double")))
    );
  }),
);

export const MONTH_AS_A_STRING_MUST_BE_SORTED = bpaRule("MONTH_(AS_A_STRING)_MUST_BE_SORTED", (m) =>
  columns(m, (c) => {
    const u = c.name.toUpperCase();
    return (
      u.includes("MONTH") &&
      !u.includes("MONTHS") &&
      dataType(c) === "string" &&
      c.sortByColumn === undefined
    );
  }),
);

// TOM's default SummarizeBy is Default, which is not None, so a column without the property is flagged.
export const NUMERIC_COLUMN_SUMMARIZE_BY = bpaRule("NUMERIC_COLUMN_SUMMARIZE_BY", (m) =>
  columns(
    m,
    (c) =>
      isNumericType(c) &&
      (c.summarizeBy ?? "default").toLowerCase() !== "none" &&
      !hiddenOrTableHidden(c),
  ),
);

export const FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS = bpaRule(
  "FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS",
  (m) =>
    columns(
      m,
      (c) =>
        !hiddenOrTableHidden(c) &&
        ((c.name.startsWith("Is") && dataType(c) === "int64") ||
          (c.name.endsWith(" Flag") && dataType(c) !== "string")),
    ),
);

export const DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN = bpaRule(
  "DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN",
  (m) => columns(m, (c) => c.kind === "data" && isBlank(c.sourceColumn)),
);

export const ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS = bpaRule(
  "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS",
  (m, { indexes: { usage } }: RuleContext) =>
    columns(
      m,
      (c) =>
        c.isAvailableInMdx &&
        hiddenOrTableHidden(c) &&
        !usage.usedInSortBy(c) &&
        !usage.usedInHierarchies(c) &&
        !usage.usedInVariations(c) &&
        c.sortByColumn === undefined,
    ),
);

export const SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS = bpaRule(
  "SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS",
  (m, { indexes: { usage } }: RuleContext) =>
    columns(
      m,
      (c) =>
        !c.isAvailableInMdx &&
        (usage.usedInSortBy(c) ||
          usage.usedInHierarchies(c) ||
          usage.usedInVariations(c) ||
          c.sortByColumn !== undefined),
    ),
);

export const UNNECESSARY_COLUMNS = bpaRule("UNNECESSARY_COLUMNS", (m, { indexes }: RuleContext) => {
  const permissions = allTablePermissions(m);
  return columns(m, (c) => {
    if (!hiddenOrTableHidden(c)) return false;
    if (indexes.references.columnReferencedBy(c).length > 0) return false;
    if (indexes.relationships.forColumn(c.table.name, c.name).length > 0) return false;
    if (indexes.usage.usedInSortBy(c) || indexes.usage.usedInHierarchies(c)) return false;
    // The source rule also does plain substring checks on RLS filters (case-insensitive).
    const bare = `[${c.name}]`.toLowerCase();
    const qualified = [
      `${c.table.name}[${c.name}]`.toLowerCase(),
      `'${c.table.name}'[${c.name}]`.toLowerCase(),
    ];
    for (const tp of permissions) {
      const f = tp.filter?.toLowerCase();
      if (f === undefined) continue;
      if (tp.table === c.table.name && f.includes(bare)) return false;
      if (qualified.some((q) => f.includes(q))) return false;
    }
    // Object-level security on the column or its table.
    for (const tp of permissions) {
      if (tp.table !== c.table.name) continue;
      if (tp.metadataPermission === "none") return false;
      if (tp.columnPermissions.some((cp) => cp.column === c.name && cp.permission === "none"))
        return false;
    }
    return true;
  });
});

const AGGREGATIONS = [
  "COUNT",
  "COUNTBLANK",
  "SUM",
  "AVERAGE",
  "VALUES",
  "DISTINCT",
  "DISTINCTCOUNT",
  "MIN",
  "MAX",
  "COUNTA",
  "AVERAGEA",
  "MAXA",
  "MINA",
];

export const HIDE_FACT_TABLE_COLUMNS = bpaRule("HIDE_FACT_TABLE_COLUMNS", (m) => {
  const measures = allMeasures(m);
  return columns(m, (c) => {
    if (c.isHidden || !isNumericType(c)) return false;
    const re = new RegExp(
      `(?:${AGGREGATIONS.join("|")})\\s*\\(\\s*'*${escapeRegExp(c.table.name)}'*\\[${escapeRegExp(c.name)}\\]\\s*\\)`,
      "i",
    );
    return measures.some((x) => re.test(x.expression));
  });
});

export const columnRules = [
  AVOID_FLOATING_POINT_DATA_TYPES,
  DATECOLUMN_FORMATSTRING,
  MONTHCOLUMN_FORMATSTRING,
  ADD_DATA_CATEGORY_FOR_COLUMNS,
  MONTH_AS_A_STRING_MUST_BE_SORTED,
  NUMERIC_COLUMN_SUMMARIZE_BY,
  FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS,
  DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN,
  ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS,
  SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS,
  UNNECESSARY_COLUMNS,
  HIDE_FACT_TABLE_COLUMNS,
];
