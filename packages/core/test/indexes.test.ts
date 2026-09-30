import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { tokenizeDax } from "../src/dax/tokenize.js";
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
  it("finds qualified and bare references, in the order the expression has them", () => {
    expect(extractRefs("SUM('Sales'[Amount]) + Sales[Qty] + [M] + 'O''Brien'[X]")).toEqual([
      { table: "Sales", name: "Amount", qualified: true },
      { table: "Sales", name: "Qty", qualified: true },
      { name: "M", qualified: false },
      { table: "O'Brien", name: "X", qualified: true },
    ]);
  });
  it("reads no name inside a comment or a string", () => {
    const dax = `// [Line]
      -- 'Sales'[Dashes]
      /* Sales[Block] */
      SELECTEDVALUE('Parameter'[Fields]) = "'Sales'[Total]" && [Kept] <> "[Quoted]"`;
    expect(extractRefs(dax)).toEqual([
      { table: "Parameter", name: "Fields", qualified: true },
      { name: "Kept", qualified: false },
    ]);
  });
  it("reads extended column syntax as the column before the dot", () => {
    expect(extractRefs("CALCULATE([Sales], ALL('Calendar'[Date].[Month]))")).toEqual([
      { name: "Sales", qualified: false },
      { table: "Calendar", name: "Date", qualified: true },
    ]);
    expect(extractRefs("SAMEPERIODLASTYEAR(Orders[OrderDate].[Date])")).toEqual([
      { table: "Orders", name: "OrderDate", qualified: true },
    ]);
  });
  it("reads a name with a doubled bracket whole, and a table constructor's column as its own", () => {
    expect(extractRefs("[Availability [%]]] + '[Flag]'[[Flag]]]")).toEqual([
      { name: "Availability [%]", qualified: false },
      { table: "[Flag]", name: "[Flag]", qualified: true },
    ]);
    // Desktop's date table template reads the one column of `{ ... }`, which DAX names Value.
    expect(extractRefs("MINX({ MIN('Sales'[Date]) }, ''[Value])")).toEqual([
      { table: "Sales", name: "Date", qualified: true },
      { table: "", name: "Value", qualified: true },
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
  it("knows the columns a sibling groups by, as a field parameter's display column groups by its Fields column", () => {
    const m = modelFrom(`table P
	column P
		dataType: string
		relatedColumnDetails
			groupByColumn: 'P Fields'
	column 'P Fields'
		dataType: string
		isHidden
	column 'P Order'
		dataType: int64
		isHidden
`);
    const { usage } = buildIndexes({ model: m });
    const col = (name: string) => m.tables[0]!.columns.find((c) => c.name === name)!;
    expect(usage.usedInGroupBy(col("P Fields"))).toBe(true);
    expect(usage.usedInGroupBy(col("P Order"))).toBe(false);
    expect(usage.usedInGroupBy(col("P"))).toBe(false);
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
      { kind: "column", table: "Date", name: "Month Name", qualified: false },
      { kind: "column", table: "Sales", name: "Amount", qualified: true },
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
	measure 'Not A Call' = MySales.NetAfter(1) + Sales.NetAfterX(1) + x_Sales.NetAfter(1) + Other.Sales.NetAfter(1) + SalesXNetAfter(1) + "Sales.NetAfter"
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
  it("counts a name as a call only when the whole name, dots included, is the function's and a parenthesis follows it", () => {
    expect(i.callsOf(meas("Not A Call"))).toEqual([]);
    const callsIn = (dax: string) => functionCallReader(m.functions)(tokenizeDax(dax));
    expect(callsIn("1 +Sales.ApplyTax(1, 2)")).toEqual([fn("Sales.ApplyTax")]);
    expect(callsIn("Sales.NetAfter(Sales.ApplyTax(1, 2))")).toEqual([
      fn("Sales.ApplyTax"),
      fn("Sales.NetAfter"),
    ]);
  });
  it("counts no call inside a comment or a string", () => {
    const callsIn = (dax: string) => functionCallReader(m.functions)(tokenizeDax(dax));
    expect(
      callsIn(
        '1 // Sales.ApplyTax(1, 2)\n+ LEN("Sales.NetAfter(1)") /* Fmt.Pick(1) */ -- Tbl.Top(1)',
      ),
    ).toEqual([]);
  });
  it("tells a function from another whose name it begins", () => {
    const p = modelFrom(
      "function F = () => 1\n\nfunction 'F.G' = () => 2\n\nfunction G = () => 3\n",
    ).functions;
    const read = (dax: string) => functionCallReader(p)(tokenizeDax(dax));
    expect(read("F.G(1)")).toEqual([p[1]]);
    expect(read("F (1)")).toEqual([p[0]]);
    expect(read("G(F.G())")).toEqual([p[1], p[2]]);
  });
  it("answers called-by for a function, in model order", () => {
    expect(i.functionCalledBy(fn("Sales.ApplyTax")).map((o) => o.kind)).toEqual([
      "calculatedColumn",
      "calculationItem",
      "function",
    ]);
    expect(i.functionCalledBy(fn("Def.Total"))).toEqual([]);
  });
  it("records a function that calls itself, which DAX refuses, as its own caller", () => {
    const loop = modelFrom("function 'Loop.Self' = () => Loop.Self ( ) + 1\n");
    const r = buildIndexes({ model: loop }).references;
    const self = loop.functions[0]!;
    expect(r.callsOf(self)).toEqual([self]);
    expect(r.functionCalledBy(self).map((o) => o.object)).toEqual([self]);
  });
  it("calls nothing and resolves nothing new in a model without functions", () => {
    expect(idx.references.owners.every((o) => o.calls.length === 0)).toBe(true);
    expect(functionCallReader([])(tokenizeDax("Sales.ApplyTax(1)"))).toEqual([]);
  });
});
