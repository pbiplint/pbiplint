import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import * as rules from "../src/rules/microsoft-bpa/naming.js";
import { modelFrom, objectNames } from "./helpers.js";

const zoo = `model ' Model'

table ' Spaced '
	column ' Padded '
		dataType: string
	column lowerCalc = 1
		dataType: int64
	column lowerData
		dataType: int64
	measure ' M'
	hierarchy 'by H'
		level ' L'
			column: lowerData
	partition ' Spaced ' = m
		mode: import
		source = 1

table calc
	column Inferred
		dataType: int64
	partition calc = calculated
		mode: import
		source = {1}

table 'cg'
	calculationGroup
		calculationItem ' I' = 1
	column Name
		dataType: string
	partition 'cg' = calculationGroup
		mode: import

table 'Empty CG'
	calculationGroup
	column Name
		dataType: string
	partition 'Empty CG' = calculationGroup
		mode: import

role ' R'
	modelPermission: read

role Members
	modelPermission: read
	member 'x@example.com'
		identityProvider: AzureAD
		memberType: user

perspective ' P'

perspective Full
	perspectiveTable calc

expression ' E' = 1
`;

describe("name rules by scope", () => {
  it("TRIM_OBJECT_NAMES covers nearly everything named", () => {
    expect(objectNames(rules.TRIM_OBJECT_NAMES, zoo)).toEqual([
      "Model",
      "' Spaced '",
      "' Spaced '[ Padded ]",
      "[ M]",
      " L",
      " Spaced ",
      " I",
      " R",
      " P",
      " E",
    ]);
  });
  it("OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE has the narrower scope (no levels, roles, expressions, calculation items, calculated tables)", () => {
    expect(objectNames(rules.OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE, zoo)).toEqual([
      "Model",
      "' Spaced '",
      "' Spaced '[ Padded ]",
      "[ M]",
      " Spaced ",
      " P",
    ]);
  });
  it("FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED skips data columns and includes calculated tables and calculation groups", () => {
    expect(objectNames(rules.FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED, zoo)).toEqual([
      "' Spaced '[lowerCalc]",
      "by H",
      "'calc'",
      "'cg'",
    ]);
  });
  it("control character rules use hand-built models because TMDL cannot carry them", () => {
    const model = modelFrom("table T\n\tcolumn A\n\t\tdataType: string\n\tmeasure M = 1\n");
    model.tables[0]!.columns[0]!.name = "Bad\u0001Name";
    model.tables[0]!.measures[0]!.description = "line1\u0001line2";
    model.tables[0]!.name = "Tab\tName";
    const ctx = { indexes: buildIndexes(model) };
    expect(rules.AVOID_INVALID_NAME_CHARACTERS.check(model, ctx).map((f) => f.objectName)).toEqual([
      "'Tab\tName'[Bad\u0001Name]",
    ]);
    expect(
      rules.AVOID_INVALID_DESCRIPTION_CHARACTERS.check(model, ctx).map((f) => f.objectName),
    ).toEqual(["[M]"]);
    expect(rules.SPECIAL_CHARS_IN_OBJECT_NAMES.check(model, ctx).map((f) => f.objectName)).toEqual([
      "'Tab\tName'",
    ]);
  });
});

describe("container rules", () => {
  it("PERSPECTIVES_WITH_NO_OBJECTS, CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS, REMOVE_ROLES_WITH_NO_MEMBERS", () => {
    expect(objectNames(rules.PERSPECTIVES_WITH_NO_OBJECTS, zoo)).toEqual([" P"]);
    expect(objectNames(rules.CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS, zoo)).toEqual([
      "'Empty CG'",
    ]);
    expect(objectNames(rules.REMOVE_ROLES_WITH_NO_MEMBERS, zoo)).toEqual([" R"]);
  });
});

describe("data source rules", () => {
  const ds =
    "model Model\n\ndataSource 'Legacy SQL' = provider\n\tconnectionString: x\n\ndataSource 'Unused SQL' = provider\n\tconnectionString: y\n\ndataSource 'Mentioned SQL' = provider\n\tconnectionString: z\n\ndataSource SQL/localhost;Sales\n\tconnectionDetails =\n\t\t\t{}\n\ntable Legacy\n\tpartition Legacy = query\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Legacy\n\t\t\tdataSource: 'Legacy SQL'\n\ntable Structured\n\tpartition Structured = query\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Structured\n\t\t\tdataSource: SQL/localhost;Sales\n\ntable M\n\tpartition M = m\n\t\tmode: import\n\t\tsource = let s = Sql.Database(\"Mentioned SQL\") in s\n";
  it("REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS counts partition data sources and query text mentions", () => {
    expect(objectNames(rules.REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS, ds)).toEqual([
      "Unused SQL",
    ]);
  });
  it("AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS flags query partitions on structured sources", () => {
    expect(objectNames(rules.AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS, ds)).toEqual([
      "Structured",
    ]);
  });
});
