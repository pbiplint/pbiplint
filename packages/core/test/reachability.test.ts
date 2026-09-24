import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { buildReport } from "../src/pbir/build.js";
import type { Column, Measure } from "../src/model/types.js";
import { fixturesDir, modelFrom } from "./helpers.js";

const j = (v: unknown) => JSON.stringify(v);
const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const measure = (entity: string, property: string) => ({
  Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const visualBinding = (...fields: unknown[]) => [
  { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "P" }) },
  {
    path: "definition/pages/p1/visuals/v1/visual.json",
    text: j({
      name: "v1",
      position: {},
      visual: {
        visualType: "tableEx",
        query: { queryState: { Values: { projections: fields.map((field) => ({ field })) } } },
      },
    }),
  },
];
const tmdl = `table Sales
	column Amount
		dataType: decimal
	column 'Product ID'
		dataType: int64
	column 'Month Name'
		dataType: string
		sortByColumn: 'Month Number'
	column 'Month Number'
		dataType: int64
	column Lonely
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Sales LY' = CALCULATE([Total Sales], SAMEPERIODLASTYEAR('Date'[Date]))
	measure 'Sales YoY %' = ([Total Sales] - [Sales LY]) / [Sales LY]
	measure 'Loop A' = [Loop B] + 1
	measure 'Loop B' = [Loop A] + 1

table Product
	column 'Product ID'
		dataType: int64
	column Category
		dataType: string

table Date
	column Date
		dataType: dateTime

table Region
	column Name
		dataType: string

relationship Sales-Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

role Readers
	tablePermission Region = Region[Name] = "West"

role Filtered
	tablePermission Sales = [Sales YoY %] > 0
`;
const model = modelFrom(tmdl);
const col = (table: string, name: string): Column =>
  model.tables.find((t) => t.name === table)!.columns.find((c) => c.name === name)!;
const meas = (name: string): Measure => model.tables[0]!.measures.find((m) => m.name === name)!;

describe("buildReachabilityIndex", () => {
  it("walks from the report's fields through DAX, sort-by, relationships, and RLS to a fixed point", () => {
    const { report } = buildReport(
      visualBinding(column("Sales", "Month Name"), measure("Sales", "Total Sales")),
    );
    const reach = buildIndexes({ model, report }).reachability!;
    expect(reach.reached(col("Sales", "Month Name"))).toBe(true);
    expect(reach.reached(col("Sales", "Month Number"))).toBe(true);
    expect(reach.pathTo(col("Sales", "Month Number"))).toEqual([
      "'Sales'[Month Name]",
      "'Sales'[Month Number]",
    ]);
    expect(reach.reached(col("Sales", "Amount"))).toBe(true);
    expect(reach.pathTo(col("Sales", "Amount"))).toEqual(["[Total Sales]", "'Sales'[Amount]"]);
    expect(reach.reached(col("Sales", "Product ID"))).toBe(true);
    expect(reach.reached(col("Product", "Product ID"))).toBe(true);
    expect(reach.reached(col("Region", "Name"))).toBe(true);
    expect(reach.reached(model.tables.find((t) => t.name === "Region")!)).toBe(true);
    expect(reach.reached(col("Sales", "Lonely"))).toBe(false);
    expect(reach.reached(meas("Sales LY"))).toBe(false);
    expect(reach.reached(col("Date", "Date"))).toBe(false);
  });
  it("lists the unreached set with a reason that reads the dead chain top-down, and survives a cycle", () => {
    const { report } = buildReport(visualBinding(measure("Sales", "Total Sales")));
    const reach = buildIndexes({ model, report }).reachability!;
    const u = reach.unreached();
    expect(u.measures.map((m) => m.name)).toEqual(["Sales LY", "Sales YoY %", "Loop A", "Loop B"]);
    expect(u.columns.map((c) => `${c.table.name}.${c.name}`)).toEqual([
      "Sales.Month Name",
      "Sales.Month Number",
      "Sales.Lonely",
      "Product.Category",
      "Date.Date",
    ]);
    expect(u.tables.map((t) => t.name)).toEqual(["Date"]);
    expect(reach.reasonFor(meas("Sales YoY %"))).toBe(
      "nothing in the report reaches it, and no measure or column references it",
    );
    expect(reach.reasonFor(meas("Sales LY"))).toBe(
      "referenced only by [Sales YoY %], which nothing reaches either",
    );
    expect(reach.reasonFor(meas("Loop A"))).toBe(
      "referenced only by [Loop B], which nothing reaches either",
    );
    expect(reach.reasonFor(col("Sales", "Month Number"))).toBe(
      "referenced only by 'Sales'[Month Name], which nothing reaches either",
    );
  });
  it("names no referrer that is not a column or a measure, such as an RLS filter", () => {
    const { report } = buildReport(visualBinding(column("Sales", "Amount")));
    const reach = buildIndexes({ model, report }).reachability!;
    expect(reach.reached(meas("Sales YoY %"))).toBe(false);
    expect(reach.reasonFor(meas("Sales YoY %"))).toBe(
      "nothing in the report reaches it, and no measure or column references it",
    );
  });
  it("reaches a measure bound only in a visual's conditional formatting, and what its DAX references", () => {
    const [pageFile, visualFile] = visualBinding(column("Sales", "Amount"));
    const json = JSON.parse(visualFile!.text) as { visual: Record<string, unknown> };
    json.visual.objects = {
      dataPoint: [
        { properties: { fill: { solid: { color: { expr: measure("Sales", "Sales YoY %") } } } } },
      ],
    };
    const { report } = buildReport([pageFile!, { ...visualFile!, text: j(json) }]);
    const reach = buildIndexes({ model, report }).reachability!;
    expect(reach.pathTo(meas("Sales YoY %"))).toEqual(["[Sales YoY %]"]);
    expect(reach.pathTo(meas("Sales LY"))).toEqual(["[Sales YoY %]", "[Sales LY]"]);
    expect(reach.reached(meas("Total Sales"))).toBe(true);
  });
  it("reaches a date variation's levels, what their columns need, and the date column itself", () => {
    // tvw-baseline's local date table behind a date column's variation, with no relationship, so
    // only the report's reference can reach the date column.
    const LDT = "LocalDateTable_1b2c1fde-0cf3-455e-bfee-a8e4970804e0";
    const dated = modelFrom(`table Sales
	column OrderDate
		dataType: dateTime

		variation Variation
			isDefault
			defaultHierarchy: ${LDT}.'Date Hierarchy'

${readFileSync(`${fixturesDir}tvw-baseline.SemanticModel/definition/tables/${LDT}.tmdl`, "utf8")}`);
    const level = (name: string) => ({
      HierarchyLevel: {
        Expression: {
          Hierarchy: {
            Expression: {
              PropertyVariationSource: {
                Expression: { SourceRef: { Entity: "Sales" } },
                Name: "Variation",
                Property: "OrderDate",
              },
            },
            Hierarchy: "Date Hierarchy",
          },
        },
        Level: name,
      },
    });
    const { report } = buildReport(visualBinding(level("Year"), level("Quarter")));
    const reach = buildIndexes({ model: dated, report }).reachability!;
    const at = (table: string, name: string): Column =>
      dated.tables.find((t) => t.name === table)!.columns.find((c) => c.name === name)!;
    expect(reach.reached(at("Sales", "OrderDate"))).toBe(true);
    expect(reach.pathTo(at(LDT, "QuarterNo"))).toEqual([
      `'${LDT}'[Quarter]`,
      `'${LDT}'[QuarterNo]`,
    ]);
    expect(
      dated.tables
        .find((t) => t.name === LDT)!
        .columns.filter((c) => !reach.reached(c))
        .map((c) => c.name),
    ).toEqual(["Month", "Day"]);
  });
  it("reaches the hidden Fields column a field parameter's display column groups by", () => {
    const param = modelFrom(`table Metric
	column Metric
		dataType: string
		sortByColumn: 'Metric Order'

		relatedColumnDetails
			groupByColumn: 'Metric Fields'

	column 'Metric Fields'
		dataType: string
		isHidden

	column 'Metric Order'
		dataType: int64
		isHidden

	column Unused
		dataType: string
`);
    const { report } = buildReport(visualBinding(column("Metric", "Metric")));
    const reach = buildIndexes({ model: param, report }).reachability!;
    const at = (name: string): Column => param.tables[0]!.columns.find((c) => c.name === name)!;
    expect(reach.pathTo(at("Metric Fields"))).toEqual([
      "'Metric'[Metric]",
      "'Metric'[Metric Fields]",
    ]);
    expect(reach.reached(at("Metric Order"))).toBe(true);
    expect(reach.reached(at("Unused"))).toBe(false);
    // When nothing reaches the display column, the Fields column's reason names it.
    const { report: other } = buildReport(visualBinding(column("Metric", "Unused")));
    const unused = buildIndexes({ model: param, report: other }).reachability!;
    expect(unused.reasonFor(at("Metric Fields"))).toBe(
      "referenced only by 'Metric'[Metric], which nothing reaches either",
    );
  });
  it("roots an aggregation table's columns, and reaches the base column or table each mapping names", () => {
    // A DirectQuery detail table, an imported aggregation table mapped to it in the forms Power BI
    // writes, a count of another table's rows (its name in another case, which TMDL reads the
    // same), and a mapping to a table the model does not have.
    const agg = modelFrom(`table Sales
	column Amount
		dataType: decimal
	column 'Order Date'
		dataType: dateTime
	column Quantity
		dataType: int64
	measure 'Order Count' = COUNTROWS('Sales')
	measure 'Total Sales' = SUM('Sales'[Amount])
	partition Sales = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse") in Source{[Item = "Sales"]}[Data]

table Returns
	column 'Return ID'
		dataType: int64
	partition Returns = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse") in Source{[Item = "Returns"]}[Data]

table 'Sales Agg'
	isHidden
	column 'Order Date'
		dataType: dateTime
		alternateOf
			baseColumn: Sales.'Order Date'
	column Amount
		dataType: decimal
		alternateOf
			summarization: sum
			baseColumn: Sales.Amount
	column 'Return Count'
		dataType: int64
		alternateOf
			summarization: count
			baseTable: returns
	column Orphan
		dataType: decimal
		alternateOf
			summarization: sum
			baseColumn: Gone.Amount
	partition 'Sales Agg' = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse") in Source{[Item = "vwSalesAgg"]}[Data]
`);
    const { report } = buildReport(visualBinding(measure("Sales", "Order Count")));
    const reach = buildIndexes({ model: agg, report }).reachability!;
    const table = (name: string) => agg.tables.find((t) => t.name === name)!;
    const at = (t: string, name: string): Column => table(t).columns.find((c) => c.name === name)!;
    // No report names an aggregation column, so each is a root of its own.
    for (const name of ["Order Date", "Amount", "Return Count", "Orphan"])
      expect(reach.pathTo(at("Sales Agg", name))).toEqual([`'Sales Agg'[${name}]`]);
    expect(reach.pathTo(at("Sales", "Order Date"))).toEqual([
      "'Sales Agg'[Order Date]",
      "'Sales'[Order Date]",
    ]);
    expect(reach.pathTo(at("Sales", "Amount"))).toEqual(["'Sales Agg'[Amount]", "'Sales'[Amount]"]);
    // A count of rows needs the table, not any one of its columns.
    expect(reach.pathTo(table("Returns"))).toEqual(["'Sales Agg'[Return Count]", "'Returns'"]);
    expect(reach.reached(at("Returns", "Return ID"))).toBe(false);
    const u = reach.unreached();
    expect(u.columns.map((c) => `${c.table.name}.${c.name}`)).toEqual([
      "Sales.Quantity",
      "Returns.Return ID",
    ]);
    expect(u.tables).toEqual([]);
    // A base column the report reaches as well keeps the report's path.
    const { report: summed } = buildReport(visualBinding(measure("Sales", "Total Sales")));
    expect(
      buildIndexes({ model: agg, report: summed }).reachability!.pathTo(at("Sales", "Amount")),
    ).toEqual(["[Total Sales]", "'Sales'[Amount]"]);
  });
  it("roots no relationship to an auto date/time table, and leaves those tables out of the unreached list", () => {
    const fixture = `${fixturesDir}tvw-baseline.SemanticModel/definition/tables/`;
    const LDT = "LocalDateTable_1b2c1fde-0cf3-455e-bfee-a8e4970804e0";
    const TEMPLATE = "DateTableTemplate_f2afc5fc-2d0d-478c-92e8-dc0f26f32175";
    const dated = modelFrom(`table Sales
	column Amount
		dataType: decimal
	column OrderDate
		dataType: dateTime

		variation Variation
			isDefault
			relationship: r1
			defaultHierarchy: ${LDT}.'Date Hierarchy'

${readFileSync(`${fixture}${LDT}.tmdl`, "utf8")}
${readFileSync(`${fixture}${TEMPLATE}.tmdl`, "utf8")}
relationship r1
	joinOnDateBehavior: datePartOnly
	fromColumn: Sales.OrderDate
	toColumn: ${LDT}.Date
`);
    const { report } = buildReport(visualBinding(column("Sales", "Amount")));
    const reach = buildIndexes({ model: dated, report }).reachability!;
    const table = (name: string) => dated.tables.find((t) => t.name === name)!;
    // The index stays truthful about what is reached; the list is what an author can act on.
    expect(reach.reached(table("Sales").columns.find((c) => c.name === "OrderDate")!)).toBe(false);
    expect(reach.reached(table(LDT).columns.find((c) => c.name === "Date")!)).toBe(false);
    const u = reach.unreached();
    expect(u.columns.map((c) => `${c.table.name}.${c.name}`)).toEqual(["Sales.OrderDate"]);
    expect(u.tables).toEqual([]);
  });
  it("roots nothing through a reference to the report's extension while reportExtensions.json cannot be read", () => {
    const inExtension = {
      Measure: {
        Expression: { SourceRef: { Schema: "extension", Entity: "Sales" } },
        Property: "Total Sales",
      },
    };
    const { report } = buildReport([
      ...visualBinding(inExtension),
      {
        path: "definition/reportExtensions.json",
        text: "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> main",
      },
    ]);
    const indexes = buildIndexes({ model, report });
    expect(indexes.reportRefs!.refs.map((r) => r.resolution.kind)).toEqual(["unread"]);
    expect(indexes.reachability!.reached(meas("Total Sales"))).toBe(false);
    expect(indexes.reachability!.reached(col("Sales", "Amount"))).toBe(false);
  });
  it("is absent in a report-only or model-only project", () => {
    const { report } = buildReport(visualBinding(column("Sales", "Amount")));
    expect(buildIndexes({ report }).reachability).toBeUndefined();
    expect(buildIndexes({ report }).reportRefs).toBeDefined();
    expect(buildIndexes({ model }).reachability).toBeUndefined();
    expect(buildIndexes({ model }).reportRefs).toBeUndefined();
  });
});
