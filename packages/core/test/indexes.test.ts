import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { extractRefs, functionCallReader } from "../src/index/references.js";
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
const idx = buildIndexes({ model: zoo });
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
  it("accepts Unicode letters in unquoted table names", () => {
    expect(extractRefs("SUM(Año[Fecha]) + Größe[X]")).toEqual([
      { table: "Año", name: "Fecha", qualified: true },
      { table: "Größe", name: "X", qualified: true },
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
    const i = buildIndexes({ model: m });
    expect(i.references.refsOf(m.tables[0]!.measures[0]!)).toEqual([
      { kind: "column", table: "T", name: "Amount", qualified: true },
    ]);
    expect(i.references.refsOf(m.tables[0]!.measures[1]!)).toEqual([
      { kind: "measure", table: "T", name: "A", qualified: false },
    ]);
  });
});

describe("reference index: user-defined functions", () => {
  const m = modelFrom(`table Sales
	column Amount
		dataType: decimal
	column 'Tax Rate'
		dataType: decimal
		isHidden
	column Taxed = Sales.ApplyTax ( 'Sales'[Amount], 0.1 )
		dataType: decimal
	measure Total = SUM('Sales'[Amount])
	measure Reserve = [Total] * 0.02
		isHidden
	measure Net = sales.netafter ( [Total] )
	measure 'Not A Call' = MySales.NetAfter(1) + Sales.NetAfterX(1) + x_Sales.NetAfter(1) + Other.Sales.NetAfter(1) + "Sales.NetAfter"
	measure Fmt = 1
		formatStringDefinition = Fmt.Pick ( 1 )

table Region
	column 'Tax Rate'
		dataType: decimal

table Top
	partition Top = calculated
		mode: import
		source = Tbl.Top ( 'Sales' )

table CG
	calculationGroup
		calculationItem Taxed = Sales.ApplyTax(SELECTEDMEASURE(), 0.1)
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

role R
	modelPermission: read
	tablePermission Sales = Sec.Allow ( 'Sales'[Amount] )

function 'Sales.ApplyTax' = (amount: NUMERIC, rate: DOUBLE) => amount * ( 1 + rate )

function 'Sales.NetAfter' =
		(
			x: SCALAR NUMERIC EXPR
		) =>
			Sales.ApplyTax ( x - [Reserve], MAX ( [Tax Rate] ) ) + Sales.ApplyTax ( 1, 2 )

function 'Fmt.Pick' = (n: INT64) => "0"

function 'Tbl.Top' = (t: TABLE) => TOPN ( 1, t )

function 'Sec.Allow' = (c: ANYREF) => TRUE ()

function 'Def.Total' = (p: NUMERIC = [Total]) => p
`);
  const i = buildIndexes({ model: m }).references;
  const fn = (name: string) => m.functions.find((f) => f.name === name)!;
  const t = (name: string) => m.tables.find((x) => x.name === name)!;
  const meas = (name: string) => t("Sales").measures.find((x) => x.name === name)!;

  it("reads a function's whole expression, a bare name resolving measure-first, then to every model column of that name", () => {
    expect(i.refsOf(fn("Sales.NetAfter"))).toEqual([
      { kind: "measure", table: "Sales", name: "Reserve", qualified: false },
      { kind: "column", table: "Sales", name: "Tax Rate", qualified: false },
      { kind: "column", table: "Region", name: "Tax Rate", qualified: false },
    ]);
    // A default value in the parameter list is a real reference.
    expect(i.refsOf(fn("Def.Total"))).toEqual([
      { kind: "measure", table: "Sales", name: "Total", qualified: false },
    ]);
    expect(i.owners.filter((o) => o.kind === "function").map((o) => o.object)).toEqual(m.functions);
  });
  it("counts a measure or column named only in a function body as referenced", () => {
    expect(i.measureReferencedBy(meas("Reserve")).map((o) => o.object)).toEqual([
      fn("Sales.NetAfter"),
    ]);
    expect(i.columnReferencedBy(t("Region").columns[0]!).map((o) => o.object)).toEqual([
      fn("Sales.NetAfter"),
    ]);
  });
  it("finds the functions every kind of expression calls, in any letter case, each once", () => {
    expect(i.callsOf(meas("Net"))).toEqual([fn("Sales.NetAfter")]);
    expect(i.callsOf(fn("Sales.NetAfter"))).toEqual([fn("Sales.ApplyTax")]);
    expect(i.callsOf(t("Sales").columns[2]!)).toEqual([fn("Sales.ApplyTax")]);
    expect(i.callsOf(meas("Fmt"))).toEqual([fn("Fmt.Pick")]);
    expect(i.callsOf(t("Top"))).toEqual([fn("Tbl.Top")]);
    expect(i.callsOf(t("CG").calculationGroup!.items[0]!)).toEqual([fn("Sales.ApplyTax")]);
    expect(i.callsOf(m.roles[0]!.tablePermissions[0]!)).toEqual([fn("Sec.Allow")]);
  });
  it("counts a name as a call only when no letter, digit, underscore, or dot comes before it and a parenthesis follows it", () => {
    expect(i.callsOf(meas("Not A Call"))).toEqual([]);
    const callsIn = functionCallReader(m.functions);
    expect(callsIn("1 +Sales.ApplyTax(1, 2)")).toEqual([fn("Sales.ApplyTax")]);
    expect(callsIn("Sales.NetAfter(Sales.ApplyTax(1, 2))")).toEqual([
      fn("Sales.ApplyTax"),
      fn("Sales.NetAfter"),
    ]);
  });
  it("answers called-by for a function, in model order", () => {
    expect(i.functionCalledBy(fn("Sales.ApplyTax")).map((o) => o.kind)).toEqual([
      "calculatedColumn",
      "calculationItem",
      "function",
    ]);
    expect(i.functionCalledBy(fn("Def.Total"))).toEqual([]);
  });
  it("calls nothing and resolves nothing new in a model without functions", () => {
    expect(idx.references.owners.every((o) => o.calls.length === 0)).toBe(true);
    expect(functionCallReader([])("Sales.ApplyTax(1)")).toEqual([]);
  });
});
