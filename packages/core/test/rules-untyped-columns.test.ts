import { describe, expect, it } from "vitest";
import { typeKnown } from "../src/rules/helpers.js";
import * as columns from "../src/rules/microsoft-bpa/columns.js";
import * as relationships from "../src/rules/microsoft-bpa/relationships.js";
import * as tables from "../src/rules/microsoft-bpa/tables.js";
import { modelFrom, objectNames } from "./helpers.js";

// Calculated columns saved as Power BI Desktop saves most of them: with no dataType line, so a type
// pbiplint does not know (#164). A rule reports nothing that rests on that type.

/** A calendar table marked as a date table, whose `Date` key is untyped, as `CALENDAR` saves it. */
const calendar = [
  "table Calendar",
  "\tdataCategory: Time",
  "\tcolumn Date",
  "\t\tisKey",
  "\t\tsourceColumn: [Date]",
  "\tpartition Calendar = calculated",
  "\t\tmode: import",
  "\t\tsource = CALENDAR(MIN('Orders'[Order Date]), MAX('Orders'[Order Date]))",
];
const keyed = [
  "table Orders",
  "\tcolumn 'Order Date'",
  "\t\tdataType: dateTime",
  "\tcolumn 'Order Code'",
  "\t\tdataType: string",
  "\tcolumn 'Month Key' = YEAR('Orders'[Order Date]) * 100 + MONTH('Orders'[Order Date])",
  "\tcolumn 'Product Code' = 7",
  ...calendar,
  "table Targets",
  "\tcolumn 'Month Key'",
  "\t\tdataType: int64",
  "table Products",
  "\tcolumn 'Product Code'",
  "\t\tdataType: string",
  "\tcolumn 'Order Code'",
  "\t\tdataType: int64",
  "relationship r1",
  "\tfromColumn: Orders.'Order Date'",
  "\ttoColumn: Calendar.Date",
  "relationship r2",
  "\tfromColumn: Orders.'Month Key'",
  "\ttoColumn: Targets.'Month Key'",
  "relationship r3",
  "\tfromColumn: Orders.'Product Code'",
  "\ttoColumn: Products.'Product Code'",
  "relationship r4",
  "\tfromColumn: Orders.'Order Code'",
  "\ttoColumn: Products.'Order Code'",
].join("\n");

describe("a column with no dataType line (#164)", () => {
  it("has a type pbiplint does not know", () => {
    const [orders] = modelFrom(keyed).tables;
    expect(orders!.columns.map((c) => [c.name, typeKnown(c)])).toEqual([
      ["Order Date", true],
      ["Order Code", true],
      ["Month Key", false],
      ["Product Code", false],
    ]);
  });

  it("is not compared by RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, even where its DAX gives another type", () => {
    // r3 joins a whole number, by its DAX, to text: a real mismatch pbiplint cannot see.
    expect(objectNames(relationships.RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, keyed)).toEqual([
      "'Orders'[Order Code] ∞←1 'Products'[Order Code]",
    ]);
  });

  it("is not reported by RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE", () => {
    expect(
      objectNames(relationships.RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE, keyed),
    ).toEqual(["'Orders'[Order Date]", "'Orders'[Order Code]", "'Products'[Product Code]"]);
  });

  it("is not reported by either half of FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS", () => {
    const flags = [
      "table Orders",
      '\tcolumn \'Rush Flag\' = IF(1 > 0, "Y", "N")',
      "\tcolumn 'Priority Flag'",
      "\t\tdataType: int64",
      "\tcolumn 'Is Large' = IF(1 > 0, 1, 0)",
      "\tcolumn 'Is Rush'",
      "\t\tdataType: int64",
    ].join("\n");
    expect(objectNames(columns.FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS, flags)).toEqual([
      "'Orders'[Priority Flag]",
      "'Orders'[Is Rush]",
    ]);
  });

  it("counts as a marked date table's date key for both date table rules", () => {
    const marked = calendar.join("\n");
    expect(objectNames(tables.MODEL_SHOULD_HAVE_A_DATE_TABLE, marked)).toEqual([]);
    expect(
      objectNames(tables.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE, marked),
    ).toEqual([]);
    // A key whose type is known and not a date still leaves the table unmarked.
    const wholeKey = [
      "table Calendar",
      "\tdataCategory: Time",
      "\tcolumn DateKey",
      "\t\tdataType: int64",
      "\t\tisKey",
    ].join("\n");
    expect(objectNames(tables.MODEL_SHOULD_HAVE_A_DATE_TABLE, wholeKey)).toEqual(["Model"]);
    expect(
      objectNames(tables.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE, wholeKey),
    ).toEqual(["'Calendar'"]);
  });
});
