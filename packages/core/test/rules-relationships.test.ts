import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/relationships.js";
import { objectNames } from "./helpers.js";

const star = `table Sales
	column 'Product ID'
		dataType: int64
	column 'Date Key'
		dataType: dateTime
	column Category
		dataType: string
	column 'Product ID Copy'
		dataType: int64
	measure M = CALCULATE(1, USERELATIONSHIP('Sales'[Date Key], 'Date'[Date]))
	partition Sales = m
		mode: import
		source = 1

table Product
	column 'Product ID'
		dataType: int64
	column Category
		dataType: string
	partition Product = m
		mode: import
		source = 1

table Date
	dataCategory: Time
	column Date
		dataType: dateTime
		isKey
	column 'Product ID'
		dataType: string
	partition Date = m
		mode: import
		source = 1

table Lonely
	column X
		dataType: int64
	partition Lonely = m
		mode: import
		source = 1

table CG
	calculationGroup
		calculationItem I = SELECTEDMEASURE()
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

relationship r1
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

relationship r2
	isActive: false
	fromColumn: Sales.'Date Key'
	toColumn: Date.Date

relationship r3
	isActive: false
	fromColumn: Date.'Product ID'
	toColumn: Product.'Product ID'
`;

describe("relationship graph rules", () => {
  it("RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE", () => {
    expect(objectNames(rules.RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE, star)).toEqual([
      "'Sales'[Date Key]",
      "'Date'[Date]",
      "'Date'[Product ID]",
    ]);
  });
  it("HIDE_FOREIGN_KEYS compares from-column names only (the Microsoft quirk)", () => {
    // 'Product'[Product ID] is a primary key, but its name equals a from-column name, so it is flagged too.
    expect(objectNames(rules.HIDE_FOREIGN_KEYS, star)).toEqual([
      "'Sales'[Product ID]",
      "'Sales'[Date Key]",
      "'Product'[Product ID]",
      "'Date'[Product ID]",
    ]);
  });
  it("MARK_PRIMARY_KEYS skips date tables and marked keys", () => {
    expect(objectNames(rules.MARK_PRIMARY_KEYS, star)).toEqual(["'Product'[Product ID]"]);
  });
  it("REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES", () => {
    // 'Sales'[Category] duplicates 'Product'[Category], Sales is the from-side of a Product relationship.
    expect(objectNames(rules.REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES, star)).toEqual([
      "'Sales'[Category]",
    ]);
  });
  it("SNOWFLAKE_SCHEMA_ARCHITECTURE and ENSURE_TABLES_HAVE_RELATIONSHIPS ignore calculation groups", () => {
    expect(objectNames(rules.SNOWFLAKE_SCHEMA_ARCHITECTURE, star)).toEqual(["'Date'"]);
    expect(objectNames(rules.ENSURE_TABLES_HAVE_RELATIONSHIPS, star)).toEqual(["'Lonely'"]);
  });
  it("INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED only accepts from-then-to argument order", () => {
    expect(objectNames(rules.INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED, star)).toEqual([
      "'Date'[Product ID] ∞←1 'Product'[Product ID]",
    ]);
    const reversed = star.replace(
      "USERELATIONSHIP('Sales'[Date Key], 'Date'[Date])",
      "USERELATIONSHIP('Date'[Date], 'Sales'[Date Key])",
    );
    expect(
      objectNames(rules.INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED, reversed).length,
    ).toBe(2);
  });
  it("RELATIONSHIP_COLUMNS_SAME_DATA_TYPE skips relationships whose columns are missing", () => {
    expect(objectNames(rules.RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, star)).toEqual([
      "'Date'[Product ID] ∞←1 'Product'[Product ID]",
    ]);
    const dangling =
      star + "\nrelationship r4\n\tfromColumn: Sales.Nope\n\ttoColumn: Product.'Product ID'\n";
    expect(objectNames(rules.RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, dangling).length).toBe(1);
  });
  it("bi-directional and many-to-many rules", () => {
    const m =
      "relationship a\n\tfromCardinality: many\n\ttoCardinality: many\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: A.K\n\ttoColumn: B.K\n\nrelationship b\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: C.K\n\ttoColumn: D.K\n\nrelationship c\n\tfromCardinality: many\n\ttoCardinality: many\n\tfromColumn: E.K\n\ttoColumn: F.K\n\nrelationship d\n\tfromColumn: G.K\n\ttoColumn: H.K\n";
    expect(objectNames(rules.MANY_TO_MANY_RELATIONSHIPS_SHOULD_BE_SINGLE_DIRECTION, m)).toEqual([
      "'A'[K] ∞↔∞ 'B'[K]",
    ]);
    expect(
      objectNames(rules.CHECK_IF_BIDIRECTIONAL_AND_MANY_TO_MANY_RELATIONSHIPS_ARE_VALID, m),
    ).toEqual(["'A'[K] ∞↔∞ 'B'[K]", "'C'[K] ∞↔1 'D'[K]", "'E'[K] ∞←∞ 'F'[K]"]);
    // (1 bidi + 1 many-to-many, plus relationship a counted twice) / 4 = 1.0 > 0.3
    expect(
      objectNames(rules.AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS, m),
    ).toEqual(["Model"]);
    const tenPlain = Array.from(
      { length: 10 },
      (_, i) => `relationship p${i}\n\tfromColumn: P${i}.K\n\ttoColumn: Q${i}.K\n`,
    ).join("\n");
    expect(
      objectNames(
        rules.AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS,
        m + "\n" + tenPlain,
      ),
    ).toEqual([]);
  });
  it("AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY needs both a many-to-many relationship and a non-empty filter", () => {
    const m =
      'table Customer\n\tcolumn Region\n\t\tdataType: string\n\tpartition Customer = m\n\t\tmode: import\n\t\tsource = 1\n\ntable Security\n\tcolumn Region\n\t\tdataType: string\n\tpartition Security = m\n\t\tmode: import\n\t\tsource = 1\n\nrelationship r\n\tfromCardinality: many\n\ttoCardinality: many\n\tfromColumn: Customer.Region\n\ttoColumn: Security.Region\n\nrole R\n\tmodelPermission: read\n\ttablePermission Security = [Region] = "East"\n\ttablePermission Customer\n\t\tmetadataPermission: none\n';
    expect(
      objectNames(
        rules.AVOID_USING_MANY_TO_MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY,
        m,
      ),
    ).toEqual(["'Security'"]);
  });
});
