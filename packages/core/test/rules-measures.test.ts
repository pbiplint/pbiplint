import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import * as rules from "../src/rules/microsoft-bpa/measures.js";
import { modelFrom, objectNames } from "./helpers.js";

const measures = (body: string) =>
  `table T\n\tcolumn Amount\n\t\tdataType: decimal\n${body}\n\tpartition T = m\n\t\tmode: import\n\t\tsource = 1\n`;

describe("measure format rules", () => {
  it("PROVIDE_FORMAT_STRING_FOR_MEASURES accepts a format string or a format string definition and skips hidden", () => {
    const m = measures(
      '\tmeasure A = 1\n\tmeasure B = 1\n\t\tformatString: #,0\n\tmeasure C = 1\n\t\tformatStringDefinition = "0"\n\tmeasure D = 1\n\t\tisHidden\n\tmeasure E = 1\n\t\tformatString: " "',
    );
    expect(objectNames(rules.PROVIDE_FORMAT_STRING_FOR_MEASURES, m)).toEqual(["[A]", "[E]"]);
  });
  it("INTEGER_FORMATTING flags everything that is not currency, percent, #,0 or #,0.0, including no format string", () => {
    const m = measures(
      "\tmeasure A = 1\n\tmeasure B = 1\n\t\tformatString: #,0\n\tmeasure C = 1\n\t\tformatString: $ #,0\n\tmeasure D = 1\n\t\tformatString: 0.0%\n\tmeasure E = 1\n\t\tformatString: #,0.00\n\tmeasure F = 1\n\t\tformatString: #,0.0",
    );
    expect(objectNames(rules.INTEGER_FORMATTING, m)).toEqual(["[A]", "[E]"]);
  });
  it("PERCENTAGE_FORMATTING", () => {
    const m = measures(
      "\tmeasure A = 1\n\t\tformatString: 0.0%\n\tmeasure B = 1\n\t\tformatString: #,0.0%;-#,0.0%;#,0.0%\n\tmeasure C = 1\n\t\tformatString: #,0",
    );
    expect(objectNames(rules.PERCENTAGE_FORMATTING, m)).toEqual(["[A]"]);
  });
});

describe("DAX pattern rules", () => {
  it("USE_THE_DIVIDE_FUNCTION_FOR_DIVISION matches ] or ) before a slash that is not a comment", () => {
    const m = measures(
      "\tmeasure A = [X] / [Y]\n\tmeasure B = SUM(T[Amount]) / 2\n\tmeasure C = DIVIDE([X], [Y]) // note\n\tmeasure D = 1 /* c */ + [X]\n\tmeasure E = [X]/[Y]\n\tcolumn CC = [Amount] / 2\n\t\tdataType: double",
    );
    expect(objectNames(rules.USE_THE_DIVIDE_FUNCTION_FOR_DIVISION, m)).toEqual([
      "[A]",
      "[B]",
      "[E]",
      "'T'[CC]",
    ]);
  });
  it("scopes: IFERROR skips calculation items, INTERSECT skips calculated columns, EVALUATEANDLOG is measures only, RELATED is calculated columns only", () => {
    const m = `table T
	column Amount
		dataType: decimal
	column CC = IFERROR(RELATED(T[Amount]), INTERSECT(T, T))
		dataType: double
	measure M = IFERROR(EVALUATEANDLOG(INTERSECT(T, T)), RELATED(T[Amount]))
	partition T = m
		mode: import
		source = 1

table CG
	calculationGroup
		calculationItem I = IFERROR(INTERSECT(T, T), EVALUATEANDLOG(1))
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import
`;
    expect(objectNames(rules.AVOID_USING_THE_IFERROR_FUNCTION, m)).toEqual(["[M]", "'T'[CC]"]);
    expect(objectNames(rules.USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT, m)).toEqual([
      "[M]",
      "I",
    ]);
    expect(objectNames(rules.EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS, m)).toEqual([
      "[M]",
    ]);
    expect(
      objectNames(rules.REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION, m),
    ).toEqual(["'T'[CC]"]);
  });
  it("FILTER rules reproduce the source patterns, including the space-as-table-name quirk", () => {
    const m = measures(
      "\tmeasure A = CALCULATE([X], FILTER('Sales', 'Sales'[Category] = \"Bikes\"))\n\tmeasure B = CALCULATE([X], FILTER('Product', [X] > 100))\n\tmeasure C = CALCULATE([X], KEEPFILTERS('Sales'[Category] = \"Bikes\"))\n\tmeasure D = CALCULATETABLE(VALUES(T[Amount]), FILTER(T, T[Amount] > 1))\n\tmeasure E = CALCULATETABLE(VALUES(T[Amount]), FILTER(T, [X] > 1))",
    );
    // B and E: the space after the comma is accepted as the "table name" (ground-truth item 5).
    expect(objectNames(rules.FILTER_COLUMN_VALUES, m)).toEqual(["[A]", "[B]", "[D]", "[E]"]);
    expect(objectNames(rules.FILTER_MEASURE_VALUES_BY_COLUMNS, m)).toEqual(["[B]", "[E]"]);
  });
  it("AVOID_USING_'1-(X/Y)'_SYNTAX", () => {
    const m = measures(
      "\tmeasure A = 1 - DIVIDE([X], [Y])\n\tmeasure B = 1 - SUM('T'[Amount]) / SUM('T'[Amount])\n\tmeasure C = 100 + ( SUM ( T[Amount] ) / 2 )\n\tmeasure D = DIVIDE([X] - [Y], [X])\n\tmeasure E = 1 - SUM(T[Amount])",
    );
    expect(objectNames(rules.AVOID_USING_1_X_Y_SYNTAX, m)).toEqual(["[A]", "[B]", "[C]"]);
  });
  it("EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION cannot be produced from TMDL, so it is checked on a mutated model", () => {
    const model = modelFrom(measures("\tmeasure A = 1\n\tcolumn CC = 2\n\t\tdataType: int64"));
    model.tables[0]!.measures[0]!.expression = "   ";
    model.tables[0]!.columns[1]!.expression = "";
    const names = rules.EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION.check(model, {
      indexes: buildIndexes(model),
    }).map((f) => f.objectName);
    expect(names).toEqual(["[A]", "'T'[CC]"]);
  });
});
