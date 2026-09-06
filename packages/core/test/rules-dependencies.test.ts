import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/dependencies.js";
import { objectNames } from "./helpers.js";

const model = `table Sales
	column Amount
		dataType: decimal
	column Hidden
		dataType: int64
		isHidden
	column Calc = 'Sales'[Total] + [Amount]
		dataType: decimal
	measure Total = SUM('Sales'[Amount])
	measure 'Bare Column' = SUM([Amount])
	measure 'Qualified Measure' = 'Sales'[Total] * 2
	measure 'Total Copy' = SUM( 'Sales'[Amount] )
	measure Alias = [Total]
	measure 'Hidden Unused' = 1
		isHidden
	measure 'Hidden Used By Item' = 2
		isHidden
	measure 'Hidden Used By Hidden' = [Hidden Used By Item]
		isHidden
	partition Sales = m
		mode: import
		source = 1

table Calc
	column Amount
		dataType: decimal
	partition Calc = calculated
		mode: import
		source = ADDCOLUMNS(VALUES('Sales'[Amount]), "T", 'Sales'[Total])

table CG
	calculationGroup
		calculationItem Bare = IF(HASONEVALUE([Name]), SELECTEDMEASURE())
		calculationItem Qualified = 'Sales'[Total] + SELECTEDMEASURE()
		calculationItem Uses = [Hidden Used By Item]
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

role R
	modelPermission: read
	tablePermission Sales = [Amount] > 0
	tablePermission Calc = 'Calc'[Amount] > 0
`;

describe("dependency rules", () => {
  it("DAX_COLUMNS_FULLY_QUALIFIED flags measures and table permissions with bare column refs, never calculation items", () => {
    expect(objectNames(rules.DAX_COLUMNS_FULLY_QUALIFIED, model)).toEqual([
      "[Bare Column]",
      "Sales",
    ]);
  });
  it("DAX_MEASURES_UNQUALIFIED flags qualified measure refs in measures, calculated columns, calculated tables, and calculation items", () => {
    expect(objectNames(rules.DAX_MEASURES_UNQUALIFIED, model)).toEqual([
      "[Qualified Measure]",
      "'Sales'[Calc]",
      "'Calc'",
      "Qualified",
    ]);
  });
  it("AVOID_DUPLICATE_MEASURES ignores whitespace differences and flags both copies", () => {
    expect(objectNames(rules.AVOID_DUPLICATE_MEASURES, model)).toEqual(["[Total]", "[Total Copy]"]);
  });
  it("MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES requires the whole expression to be one measure reference", () => {
    expect(
      objectNames(rules.MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES, model),
    ).toEqual(["[Alias]", "[Hidden Used By Hidden]"]);
  });
  it("UNNECESSARY_MEASURES counts references from calculation items and other hidden measures", () => {
    expect(objectNames(rules.UNNECESSARY_MEASURES, model)).toEqual([
      "[Hidden Unused]",
      "[Hidden Used By Hidden]",
    ]);
  });
});
