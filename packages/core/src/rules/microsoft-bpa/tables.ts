import type { Table } from "../../model/types.js";
import {
  allColumns,
  allMeasures,
  allPartitions,
  allTablePermissions,
  dataType,
  escapeRegExp,
  expressionObjects,
  finding,
  isBlank,
  isDirectQueryTable,
  isNumericType,
  tablesInScope,
} from "../helpers.js";
import { bpaRule } from "./define.js";

const hasDateTimeKey = (t: Table): boolean =>
  t.columns.some((c) => c.isKey && dataType(c) === "datetime");

export const MODEL_SHOULD_HAVE_A_DATE_TABLE = bpaRule("MODEL_SHOULD_HAVE_A_DATE_TABLE", (m) =>
  m.tables.some((t) => t.dataCategory === "Time" && hasDateTimeKey(t)) ? [] : [finding.model(m)],
);

export const DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE = bpaRule(
  "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE",
  (m) =>
    tablesInScope(m)
      .filter((t) => {
        const u = t.name.toUpperCase();
        return (
          (u.includes("DATE") || u.includes("CALENDAR")) &&
          (t.dataCategory !== "Time" || !hasDateTimeKey(t))
        );
      })
      .map(finding.table),
);

export const REMOVE_AUTO_DATE_TABLE = bpaRule("REMOVE_AUTO-DATE_TABLE", (m) =>
  m.tables
    .filter(
      (t) =>
        t.kind === "calculated" &&
        (t.name.startsWith("DateTableTemplate_") || t.name.startsWith("LocalDateTable_")),
    )
    .map(finding.table),
);

export const REDUCE_USAGE_OF_CALCULATED_TABLES = bpaRule("REDUCE_USAGE_OF_CALCULATED_TABLES", (m) =>
  m.tables.filter((t) => t.kind === "calculated").map(finding.table),
);

export const REDUCE_NUMBER_OF_CALCULATED_COLUMNS = bpaRule(
  "REDUCE_NUMBER_OF_CALCULATED_COLUMNS",
  (m) =>
    allColumns(m).filter((c) => c.kind === "calculated").length > 5 ? [finding.model(m)] : [],
);

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN"];

export const UNPIVOT_PIVOTED_MONTH_DATA = bpaRule("UNPIVOT_PIVOTED_(MONTH)_DATA", (m) =>
  tablesInScope(m)
    .filter((t) =>
      MONTHS.every((mo) =>
        t.columns.some((c) => c.name.toUpperCase().includes(mo) && isNumericType(c)),
      ),
    )
    .map(finding.table),
);

// Scope is Table only: calculated tables and calculation groups are not checked.
export const PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES = bpaRule(
  "PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES",
  (m) =>
    m.tables
      .filter(
        (t) => t.kind === "table" && t.partitions.length === 1 && t.partitions[0]!.name !== t.name,
      )
      .map(finding.table),
);

const POWER_QUERY_PATTERNS = [
  "Table.Combine(",
  "Table.Join(",
  "Table.NestedJoin(",
  "Table.AddColumn(",
  "Table.Group(",
  "Table.Sort(",
  "Table.Pivot(",
  "Table.Unpivot(",
  "Table.UnpivotOtherColumns(",
  "Table.Distinct(",
  '[Query="SELECT',
  "Value.NativeQuery",
  "OleDb.Query",
  "Odbc.Query",
];

export const MINIMIZE_POWER_QUERY_TRANSFORMATIONS = bpaRule(
  "MINIMIZE_POWER_QUERY_TRANSFORMATIONS",
  (m) =>
    allPartitions(m)
      .filter(
        (p) =>
          p.sourceType === "m" && POWER_QUERY_PATTERNS.some((s) => (p.source ?? "").includes(s)),
      )
      .map(finding.partition),
);

export const MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS = bpaRule(
  "MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS",
  (m) =>
    m.tables.some(isDirectQueryTable) &&
    !allColumns(m).some((c) => c.hasAlternateOf) &&
    String(m.props.defaultpowerbidatasourceversion ?? "").toLowerCase() === "powerbi_v3"
      ? [finding.model(m)]
      : [],
);

const TIME_INTELLIGENCE_FUNCTIONS = [
  "CLOSINGBALANCEMONTH",
  "CLOSINGBALANCEQUARTER",
  "CLOSINGBALANCEYEAR",
  "DATEADD",
  "DATESBETWEEN",
  "DATESINPERIOD",
  "DATESMTD",
  "DATESQTD",
  "DATESYTD",
  "ENDOFMONTH",
  "ENDOFQUARTER",
  "ENDOFYEAR",
  "FIRSTDATE",
  "FIRSTNONBLANK",
  "FIRSTNONBLANKVALUE",
  "LASTDATE",
  "LASTNONBLANK",
  "LASTNONBLANKVALUE",
  "NEXTDAY",
  "NEXTMONTH",
  "NEXTQUARTER",
  "NEXTYEAR",
  "OPENINGBALANCEMONTH",
  "OPENINGBALANCEQUARTER",
  "OPENINGBALANCEYEAR",
  "PARALLELPERIOD",
  "PREVIOUSDAY",
  "PREVIOUSMONTH",
  "PREVIOUSQUARTER",
  "PREVIOUSYEAR",
  "SAMEPERIODLASTYEAR",
  "STARTOFMONTH",
  "STARTOFQUARTER",
  "STARTOFYEAR",
  "TOTALMTD",
  "TOTALQTD",
  "TOTALYTD",
];
// The source patterns have no (?i), so this one is case-sensitive.
const TIME_INTELLIGENCE = new RegExp(`(?:${TIME_INTELLIGENCE_FUNCTIONS.join("|")})\\s*\\(`);

export const MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY = bpaRule(
  "MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY",
  (m) =>
    m.tables.some(isDirectQueryTable)
      ? expressionObjects(m, ["measure", "calculationItem"])
          .filter((o) => TIME_INTELLIGENCE.test(o.expression))
          .map((o) => o.finding)
      : [],
);

const RLS_FUNCTIONS = [/RIGHT\s*\(/i, /LEFT\s*\(/i, /UPPER\s*\(/i, /LOWER\s*\(/i, /FIND\s*\(/i];

// The source removes spaces from the filter before matching, so "L E F T(" matches and so does "BRIGHT(".
export const LIMIT_ROW_LEVEL_SECURITY_LOGIC = bpaRule(
  "LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC",
  (m) => {
    const permissions = allTablePermissions(m);
    return tablesInScope(m)
      .filter((t) =>
        permissions.some(
          (tp) =>
            tp.table === t.name &&
            tp.filter !== undefined &&
            RLS_FUNCTIONS.some((re) => re.test(tp.filter!.replace(/ /g, ""))),
        ),
      )
      .map(finding.table);
  },
);

// No \s* between the function name and the parenthesis in the source, so "USERPRINCIPALNAME ()" is not matched.
export const CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_IS_NECESSARY = bpaRule(
  "CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY",
  (m) =>
    allTablePermissions(m)
      .filter(
        (tp) =>
          tp.filter !== undefined &&
          (/USERNAME\(/i.test(tp.filter) || /USERPRINCIPALNAME\(/i.test(tp.filter)),
      )
      .map(finding.tablePermission),
);

export const AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE = bpaRule(
  "AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE",
  (m) => {
    const permissions = allTablePermissions(m);
    const measures = allMeasures(m);
    return tablesInScope(m)
      .filter((t) => {
        if (!permissions.some((tp) => tp.table === t.name && tp.filter !== undefined)) return false;
        const re = new RegExp(
          `USERELATIONSHIP\\s*\\(\\s*.+?(?=\\])\\]\\s*,\\s*'*${escapeRegExp(t.name)}'*\\[`,
          "i",
        );
        return measures.some((x) => re.test(x.expression));
      })
      .map(finding.table);
  },
);

// Scope: Table, Measure, DataColumn, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroup.
// Visibility is the object's own IsHidden (a visible column in a hidden table is still reported).
// Findings follow model order: each table, then its columns, then its measures.
export const OBJECTS_WITH_NO_DESCRIPTION = bpaRule("OBJECTS_WITH_NO_DESCRIPTION", (m) =>
  m.tables.flatMap((t) => [
    ...(isBlank(t.description) && !t.isHidden ? [finding.table(t)] : []),
    ...t.columns.filter((c) => isBlank(c.description) && !c.isHidden).map(finding.column),
    ...t.measures.filter((x) => isBlank(x.description) && !x.isHidden).map(finding.measure),
  ]),
);

export const tableRules = [
  MODEL_SHOULD_HAVE_A_DATE_TABLE,
  DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE,
  REMOVE_AUTO_DATE_TABLE,
  REDUCE_USAGE_OF_CALCULATED_TABLES,
  REDUCE_NUMBER_OF_CALCULATED_COLUMNS,
  UNPIVOT_PIVOTED_MONTH_DATA,
  PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES,
  MINIMIZE_POWER_QUERY_TRANSFORMATIONS,
  MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS,
  MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY,
  LIMIT_ROW_LEVEL_SECURITY_LOGIC,
  CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_IS_NECESSARY,
  AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE,
  OBJECTS_WITH_NO_DESCRIPTION,
];
