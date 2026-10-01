import {
  allColumns,
  dataType,
  finding,
  hiddenOrTableHidden,
  isBlank,
  tablesPartlyRead,
} from "../helpers.js";
import { pbiplintRule } from "./define.js";

// The idea of Tabular Editor 3's built-in TE3_BUILT_IN_FORMAT_STRING_COLUMNS, for Decimal number
// and Fixed decimal number columns only. Documented deviations from it: whole-number and date
// columns are left out, and a column with no dataType line is skipped, since its type is unknown
// to pbiplint (#164). A part of the column's table pbiplint could not read may hide the table.
export const DECIMAL_COLUMN_WITHOUT_FORMAT_STRING = pbiplintRule({
  id: "DECIMAL_COLUMN_WITHOUT_FORMAT_STRING",
  name: "Visible decimal column with no format string",
  category: "Formatting",
  severity: 1,
  scope: ["Column", "CalculatedColumn", "CalculatedTableColumn"],
  layer: "model",
  skipWhenModelUnread: tablesPartlyRead,
  check: ({ model }) =>
    (model ? allColumns(model) : [])
      .filter(
        (c) =>
          (dataType(c) === "double" || dataType(c) === "decimal") &&
          !hiddenOrTableHidden(c) &&
          isBlank(c.formatString),
      )
      .map(finding.column),
});

export const formattingRules = [DECIMAL_COLUMN_WITHOUT_FORMAT_STRING];
