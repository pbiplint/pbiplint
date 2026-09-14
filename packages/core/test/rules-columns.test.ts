import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/columns.js";
import { objectNames } from "./helpers.js";

const col = (body: string) =>
  `table T\n${body}\n\tpartition T = m\n\t\tmode: import\n\t\tsource = 1\n`;

describe("column property rules", () => {
  it("AVOID_FLOATING_POINT_DATA_TYPES flags double columns of any kind", () => {
    expect(
      objectNames(
        rules.AVOID_FLOATING_POINT_DATA_TYPES,
        col(
          "\tcolumn A\n\t\tdataType: double\n\tcolumn B = 1\n\t\tdataType: Double\n\tcolumn C\n\t\tdataType: decimal",
        ),
      ),
    ).toEqual(["'T'[A]", "'T'[B]"]);
  });
  it("DATECOLUMN_FORMATSTRING and MONTHCOLUMN_FORMATSTRING match names case-insensitively and exact format strings", () => {
    const m = col(
      "\tcolumn 'Order date'\n\t\tdataType: dateTime\n\t\tformatString: Long Date\n\tcolumn 'Ship Date'\n\t\tdataType: dateTime\n\t\tformatString: mm/dd/yyyy\n\tcolumn 'Month Start'\n\t\tdataType: dateTime\n\tcolumn Update\n\t\tdataType: dateTime",
    );
    expect(objectNames(rules.DATECOLUMN_FORMATSTRING, m)).toEqual([
      "'T'[Order date]",
      "'T'[Update]",
    ]);
    expect(objectNames(rules.MONTHCOLUMN_FORMATSTRING, m)).toEqual(["'T'[Month Start]"]);
  });
  it("ADD_DATA_CATEGORY_FOR_COLUMNS looks at names and types", () => {
    const m = col(
      "\tcolumn City\n\t\tdataType: string\n\tcolumn Latitude\n\t\tdataType: double\n\tcolumn 'Country Code'\n\t\tdataType: int64\n\tcolumn Continent\n\t\tdataType: string\n\t\tdataCategory: Continent",
    );
    expect(objectNames(rules.ADD_DATA_CATEGORY_FOR_COLUMNS, m)).toEqual([
      "'T'[City]",
      "'T'[Latitude]",
    ]);
  });
  it("MONTH_(AS_A_STRING)_MUST_BE_SORTED ignores MONTHS and sorted columns", () => {
    const m = col(
      "\tcolumn Month\n\t\tdataType: string\n\tcolumn Months\n\t\tdataType: string\n\tcolumn MonthName\n\t\tdataType: string\n\t\tsortByColumn: Month\n\tcolumn MonthNo\n\t\tdataType: int64",
    );
    expect(objectNames(rules.MONTH_AS_A_STRING_MUST_BE_SORTED, m)).toEqual(["'T'[Month]"]);
  });
  it("NUMERIC_COLUMN_SUMMARIZE_BY treats a missing summarizeBy as not none and skips hidden columns", () => {
    const m = col(
      "\tcolumn A\n\t\tdataType: int64\n\tcolumn B\n\t\tdataType: decimal\n\t\tsummarizeBy: none\n\tcolumn C\n\t\tdataType: double\n\t\tisHidden\n\tcolumn D\n\t\tdataType: string",
    );
    expect(objectNames(rules.NUMERIC_COLUMN_SUMMARIZE_BY, m)).toEqual(["'T'[A]"]);
  });
  it("FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS", () => {
    const m = col(
      "\tcolumn IsActive\n\t\tdataType: int64\n\tcolumn Island\n\t\tdataType: string\n\tcolumn 'VIP Flag'\n\t\tdataType: boolean\n\tcolumn 'Text Flag'\n\t\tdataType: string\n\tcolumn IsHiddenOne\n\t\tdataType: int64\n\t\tisHidden",
    );
    expect(objectNames(rules.FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS, m)).toEqual([
      "'T'[IsActive]",
      "'T'[VIP Flag]",
    ]);
  });
  it("DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN skips calculated columns", () => {
    const m = col(
      "\tcolumn A\n\t\tdataType: string\n\tcolumn B = 1\n\t\tdataType: int64\n\tcolumn C\n\t\tdataType: string\n\t\tsourceColumn: C",
    );
    expect(objectNames(rules.DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN, m)).toEqual(["'T'[A]"]);
  });
  it("ISAVAILABLEINMDX rules use the usage index", () => {
    const m = col(
      "\tcolumn Hidden\n\t\tdataType: int64\n\t\tisHidden\n\tcolumn SortTarget\n\t\tdataType: int64\n\t\tisHidden\n\tcolumn Name\n\t\tdataType: string\n\t\tsortByColumn: SortTarget\n\tcolumn Off\n\t\tdataType: string\n\t\tisAvailableInMdx: false\n\t\tsortByColumn: SortTarget\n\thierarchy H\n\t\tlevel L\n\t\t\tcolumn: Name",
    );
    expect(objectNames(rules.ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS, m)).toEqual([
      "'T'[Hidden]",
    ]);
    expect(objectNames(rules.SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS, m)).toEqual([
      "'T'[Off]",
    ]);
  });
  it("UNNECESSARY_COLUMNS honors references, relationships, sort-by, hierarchies, RLS text, and OLS", () => {
    const m = `table T
	column Unused
		dataType: int64
		isHidden
	column InMeasure
		dataType: int64
		isHidden
	column InRel
		dataType: int64
		isHidden
	column InRlsBare
		dataType: int64
		isHidden
	column InRlsOther
		dataType: int64
		isHidden
	column Ols
		dataType: int64
		isHidden
	measure M = SUM('T'[InMeasure])
	partition T = m
		mode: import
		source = 1

table U
	isHidden
	column K
		dataType: int64
	column TableOls
		dataType: int64
	partition U = m
		mode: import
		source = 1

relationship r
	fromColumn: T.InRel
	toColumn: U.K

role R
	modelPermission: read
	tablePermission T = [InRlsBare] = 1
		columnPermission Ols = none
	tablePermission U = 'T'[InRlsOther] = 1
		metadataPermission: none
`;
    expect(objectNames(rules.UNNECESSARY_COLUMNS, m)).toEqual(["'T'[Unused]"]);
  });
  it("HIDE_FACT_TABLE_COLUMNS matches aggregations over qualified references only", () => {
    const m = col(
      "\tcolumn Amount\n\t\tdataType: decimal\n\tcolumn Qty\n\t\tdataType: int64\n\tcolumn Name\n\t\tdataType: string\n\tmeasure A = SUM ( 'T'[Amount] )\n\tmeasure B = sum(T[Qty]) + COUNTA('T'[Name])\n\tmeasure C = SUMX(T, [Amount])",
    );
    expect(objectNames(rules.HIDE_FACT_TABLE_COLUMNS, m)).toEqual(["'T'[Amount]", "'T'[Qty]"]);
  });
});
