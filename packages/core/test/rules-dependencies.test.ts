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

/** A user-defined function that nothing calls, naming a hidden measure and a column bare and a measure qualified. */
const withFunction = `table Sales
	column Amount
		dataType: decimal
	measure Total = SUM('Sales'[Amount])
	measure 'Used In Function' = 1
		isHidden
	measure 'Unused' = 2
		isHidden

function 'Sales.Uncalled' = () => [Used In Function] + SUM ( [Amount] ) + 'Sales'[Total]
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
  it("DAX_COLUMNS_FULLY_QUALIFIED reads extended column syntax as the qualified column before the dot", () => {
    const m = `table Calendar
	column Date
		dataType: dateTime
	column Month
		dataType: string
	measure 'All Months' = CALCULATE ( COUNTROWS ( 'Calendar' ), ALL ( 'Calendar'[Date].[Month] ) )
`;
    expect(objectNames(rules.DAX_COLUMNS_FULLY_QUALIFIED, m)).toEqual([]);
  });
  it("DAX_MEASURES_UNQUALIFIED leaves a qualified measure named inside a string alone, as a field parameter's name is", () => {
    const m = `table Sales
	column Amount
		dataType: decimal
	measure Total = SUM ( 'Sales'[Amount] )
	measure Pick = IF ( SELECTEDVALUE ( 'Parameter'[Parameter Fields] ) = "'Sales'[Total]", [Total] )

table Parameter
	column 'Parameter Fields'
		dataType: string
`;
    expect(objectNames(rules.DAX_MEASURES_UNQUALIFIED, m)).toEqual([]);
  });
  it("AVOID_DUPLICATE_MEASURES ignores whitespace differences and flags both copies", () => {
    expect(objectNames(rules.AVOID_DUPLICATE_MEASURES, model)).toEqual(["[Total]", "[Total Copy]"]);
  });
  it("MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES requires the whole expression to be one measure reference", () => {
    expect(
      objectNames(rules.MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES, model),
    ).toEqual(["[Alias]", "[Hidden Used By Hidden]"]);
  });
  it("DAX_COLUMNS_FULLY_QUALIFIED and DAX_MEASURES_UNQUALIFIED leave a user-defined function's body alone", () => {
    expect(objectNames(rules.DAX_COLUMNS_FULLY_QUALIFIED, withFunction)).toEqual([]);
    expect(objectNames(rules.DAX_MEASURES_UNQUALIFIED, withFunction)).toEqual([]);
  });
  it("UNNECESSARY_MEASURES counts a measure that only a KPI's target names", () => {
    // The shape of Microsoft's Store Sales sample, whose KPIs compare this year with last year.
    const m = `table Sales
	column Amount
		dataType: decimal
	measure 'This Year Sales' = SUM ( 'Sales'[Amount] )
		kpi
			targetExpression = 'Sales'[Last Year Sales]
			statusExpression = IF ( [This Year Sales] >= [Last Year Sales], 1, -1 )
	measure 'Last Year Sales' = SUM ( 'Sales'[Amount] ) * 0.9
		isHidden
	measure Unused = 1
		isHidden
`;
    expect(objectNames(rules.UNNECESSARY_MEASURES, m)).toEqual(["[Unused]"]);
  });
  it("UNNECESSARY_MEASURES counts a measure named in a user-defined function, even one nothing calls", () => {
    expect(objectNames(rules.UNNECESSARY_MEASURES, withFunction)).toEqual(["[Unused]"]);
  });
  it("UNNECESSARY_MEASURES counts a measure named in a function after one whose code fence was left open", () => {
    // Every function shares functions.tmdl, so an open fence there used to swallow the functions
    // after it, and what only they named read as unused.
    const fenceLeftOpen = [
      "table Sales",
      "\tmeasure 'Used In B' = 1",
      "\t\tisHidden",
      "\tmeasure 'Used In C' = 2",
      "\t\tisHidden",
      "\tmeasure Unused = 3",
      "\t\tisHidden",
      "",
      "function A = ```",
      "\t\t() => 0",
      "\tlineageTag: a",
      "",
      "function B = () => [Used In B]",
      "",
      "function C = ```",
      "\t\t() => [Used In C]",
      "\t\t```",
      "",
    ].join("\n");
    expect(objectNames(rules.UNNECESSARY_MEASURES, fenceLeftOpen)).toEqual(["[Unused]"]);
  });
  it("UNNECESSARY_MEASURES counts references from calculation items and other hidden measures", () => {
    expect(objectNames(rules.UNNECESSARY_MEASURES, model)).toEqual([
      "[Hidden Unused]",
      "[Hidden Used By Hidden]",
    ]);
  });
});
