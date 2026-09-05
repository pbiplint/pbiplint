import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { extractRefs } from "../src/index/references.js";
import { modelFrom } from "./helpers.js";

const zoo = modelFrom(`table Sales
	column Amount
		dataType: decimal
		isHidden
	column Year
		dataType: int64
	column 'Cat'
		dataType: string
		sortByColumn: 'Cat Order'
	column 'Cat Order'
		dataType: int64
	measure 'Total Amount' = SUM('Sales'[Amount])
	measure 'Bare Own' = SUM([Amount])
	measure 'Bare Other' = COUNTROWS(FILTER('Date', [Month Name] = "Jan"))
	measure 'Bare Measure' = [Total Amount] * 2
	measure 'Qualified Measure' = 'Sales'[Total Amount] * 2
	measure 'Unresolved' = [Nothing Here]
	measure 'Fsd' = 1
		formatStringDefinition = IF([Total Amount] > 1, "0", "0.0")
	hierarchy H
		level L
			column: Year
	partition Sales = m
		mode: import
		source = let Source = 1 in Source

table Date
	column Date
		dataType: dateTime
		variation V
			defaultColumn: Sales.Year
	column 'Month Name'
		dataType: string
	column Amount
		dataType: int64
	partition Date = calculated
		mode: import
		source = ADDCOLUMNS(CALENDARAUTO(), "Amt", [Total Amount])

table CG
	calculationGroup
		calculationItem 'Bare Col' = IF(HASONEVALUE([Name]), SELECTEDMEASURE())
		calculationItem 'Qualified Col' = IF(HASONEVALUE('CG'[Name]), SELECTEDMEASURE())
		calculationItem 'Bare Measure' = [Total Amount]
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

relationship r1
	fromColumn: Sales.Year
	toColumn: Date.Date

role R
	modelPermission: read
	tablePermission Date = [Month Name] = "Jan" && 'Sales'[Amount] > 0
`);
const idx = buildIndexes(zoo);
const table = (n: string) => zoo.tables.find((t) => t.name === n)!;
const column = (t: string, c: string) => table(t).columns.find((x) => x.name === c)!;
const measure = (n: string) => zoo.tables.flatMap((t) => t.measures).find((m) => m.name === n)!;

describe("extractRefs", () => {
  it("finds qualified and bare references", () => {
    expect(extractRefs("SUM('Sales'[Amount]) + Sales[Qty] + [M] + 'O''Brien'[X]")).toEqual([
      { table: "Sales", name: "Amount", qualified: true },
      { table: "Sales", name: "Qty", qualified: true },
      { table: "O'Brien", name: "X", qualified: true },
      { name: "M", qualified: false },
    ]);
  });
});

describe("relationship index", () => {
  it("looks up by column and table from either side", () => {
    expect(idx.relationships.forColumn("Sales", "Year").map((r) => r.name)).toEqual(["r1"]);
    expect(idx.relationships.forColumn("Date", "Date").map((r) => r.name)).toEqual(["r1"]);
    expect(idx.relationships.forColumn("Sales", "Amount")).toEqual([]);
    expect(idx.relationships.forTable("Date").length).toBe(1);
  });
});

describe("usage index", () => {
  it("knows sort-by targets, hierarchy levels, and variation default columns", () => {
    expect(idx.usage.usedInSortBy(column("Sales", "Cat Order"))).toBe(true);
    expect(idx.usage.usedInSortBy(column("Sales", "Cat"))).toBe(false);
    expect(idx.usage.usedInHierarchies(column("Sales", "Year"))).toBe(true);
    expect(idx.usage.usedInVariations(column("Sales", "Year"))).toBe(true);
    expect(idx.usage.usedInVariations(column("Sales", "Amount"))).toBe(false);
  });
});

describe("reference index", () => {
  it("resolves qualified references column-first, then measure", () => {
    expect(idx.references.refsOf(measure("Total Amount"))).toEqual([
      { kind: "column", table: "Sales", name: "Amount", qualified: true },
    ]);
    expect(idx.references.refsOf(measure("Qualified Measure"))).toEqual([
      { kind: "measure", table: "Sales", name: "Total Amount", qualified: true },
    ]);
  });
  it("resolves bare references measure-first, then own table, then any table", () => {
    expect(idx.references.refsOf(measure("Bare Own"))).toEqual([
      { kind: "column", table: "Sales", name: "Amount", qualified: false },
    ]);
    expect(idx.references.refsOf(measure("Bare Other"))).toEqual([
      { kind: "column", table: "Date", name: "Month Name", qualified: false },
    ]);
    expect(idx.references.refsOf(measure("Bare Measure"))).toEqual([
      { kind: "measure", table: "Sales", name: "Total Amount", qualified: false },
    ]);
    expect(idx.references.refsOf(measure("Unresolved"))).toEqual([
      { kind: "unresolved", name: "Nothing Here", qualified: false },
    ]);
  });
  it("never resolves a bare non-measure reference inside a calculation item", () => {
    const items = table("CG").calculationGroup!.items;
    expect(idx.references.refsOf(items[0]!)).toEqual([
      { kind: "unresolved", name: "Name", qualified: false },
    ]);
    expect(idx.references.refsOf(items[1]!)).toEqual([
      { kind: "column", table: "CG", name: "Name", qualified: true },
    ]);
    expect(idx.references.refsOf(items[2]!)).toEqual([
      { kind: "measure", table: "Sales", name: "Total Amount", qualified: false },
    ]);
  });
  it("scans calculated table sources, table permissions, and format string definitions", () => {
    expect(idx.references.refsOf(table("Date"))).toEqual([
      { kind: "measure", table: "Sales", name: "Total Amount", qualified: false },
    ]);
    const tp = zoo.roles[0]!.tablePermissions[0]!;
    expect(idx.references.refsOf(tp)).toEqual([
      { kind: "column", table: "Sales", name: "Amount", qualified: true },
      { kind: "column", table: "Date", name: "Month Name", qualified: false },
    ]);
    expect(idx.references.refsOf(measure("Fsd"))).toEqual([
      { kind: "measure", table: "Sales", name: "Total Amount", qualified: false },
    ]);
  });
  it("answers referenced-by for columns and measures", () => {
    expect(idx.references.columnReferencedBy(column("Sales", "Amount")).map((o) => o.kind)).toEqual(
      ["measure", "measure", "tablePermission"],
    );
    expect(idx.references.columnReferencedBy(column("Date", "Amount"))).toEqual([]);
    // Bare Measure, Qualified Measure, Fsd, the Date calculated table, and calculation item 'Bare Measure'.
    expect(idx.references.measureReferencedBy(measure("Total Amount")).length).toBe(5);
    expect(idx.references.measureReferencedBy(measure("Unresolved"))).toEqual([]);
  });
  it("is case-insensitive on names", () => {
    const m = modelFrom(
      "table T\n\tcolumn Amount\n\t\tdataType: int64\n\tmeasure A = SUM('t'[amount])\n\tmeasure B = [a] + 1\n",
    );
    const i = buildIndexes(m);
    expect(i.references.refsOf(m.tables[0]!.measures[0]!)).toEqual([
      { kind: "column", table: "T", name: "Amount", qualified: true },
    ]);
    expect(i.references.refsOf(m.tables[0]!.measures[1]!)).toEqual([
      { kind: "measure", table: "T", name: "A", qualified: false },
    ]);
  });
});
