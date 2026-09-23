import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReportReferenceIndex, type Resolution } from "../src/index/report-refs.js";
import { buildReport } from "../src/pbir/build.js";
import { fixturesDir, modelFrom } from "./helpers.js";

const j = (v: unknown) => JSON.stringify(v);
const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const measure = (entity: string, property: string) => ({
  Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});

const model = modelFrom(`table Sales
	column Amount
		dataType: decimal
	column Region
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	hierarchy Geography
		level Region
			column: Region

table Product
	column Category
		dataType: string
	measure 'Product Count' = COUNTROWS(Product)
`);

const { report } = buildReport([
  {
    path: "definition/report.json",
    text: j({
      filterConfig: {
        filters: [{ name: "rf", field: column("Product", "Category"), type: "Categorical" }],
      },
    }),
  },
  {
    path: "definition/pages/p1/page.json",
    text: j({
      name: "p1",
      displayName: "Overview",
      filterConfig: {
        filters: [{ name: "pf", field: column("Customer", "Segment"), type: "Categorical" }],
      },
    }),
  },
  {
    path: "definition/pages/p1/visuals/v1/visual.json",
    text: j({
      name: "v1",
      position: {},
      filterConfig: {
        filters: [{ name: "vf", field: column("Sales", "Nope"), type: "Categorical" }],
      },
      visual: {
        visualType: "clusteredBarChart",
        query: {
          queryState: {
            Category: {
              projections: [
                { field: column("Sales", "Region") },
                {
                  field: {
                    HierarchyLevel: {
                      Expression: {
                        Hierarchy: {
                          Expression: { SourceRef: { Entity: "Sales" } },
                          Hierarchy: "Geography",
                        },
                      },
                      Level: "Region",
                    },
                  },
                },
              ],
            },
            Y: {
              projections: [
                { field: measure("Sales", "Total Sales") },
                { field: measure("Sales", "Net Margin") },
                { field: measure("Product", "Total Sales") },
                { field: measure("Sales", "Profit") },
              ],
            },
          },
        },
      },
    }),
  },
  {
    path: "definition/bookmarks/b1.bookmark.json",
    text: j({
      name: "b1",
      displayName: "B",
      explorationState: {
        activeSection: "p1",
        sections: {
          p1: {
            visualContainers: {
              v1: { filters: { byExpr: [{ expression: column("Sales", "Amount") }] } },
            },
          },
        },
      },
    }),
  },
  {
    path: "definition/reportExtensions.json",
    text: j({
      entities: [
        {
          name: "Sales",
          measures: [
            { name: "Net Margin", expression: "[Total Sales] - SUM('Sales'[Amount]) + [Missing]" },
            { name: "Doubled", expression: "'Sales'[Net Margin] * 2" },
          ],
        },
      ],
    }),
  },
]);

describe("buildReportReferenceIndex", () => {
  const index = buildReportReferenceIndex(report, model);
  it("resolves visual fields, filters, bookmarks, and report measures against the model", () => {
    const v1 = report.pages[0]!.visuals[0]!;
    const roles = index
      .fieldsOf(v1)
      .map((r) => [r.owner.kind === "visualField" ? r.owner.role : "", r.resolution.kind]);
    expect(roles).toEqual([
      ["Category", "column"],
      ["Category", "hierarchy"],
      ["Y", "measure"],
      ["Y", "reportMeasure"],
      ["Y", "unresolved"],
      ["Y", "unresolved"],
    ]);
    const amount = model.tables[0]!.columns[0]!;
    expect(index.referencedBy(amount).map((r) => r.owner.kind)).toEqual([
      "bookmark",
      "reportMeasure",
    ]);
    const total = model.tables[0]!.measures[0]!;
    expect(index.referencedBy(total).map((r) => r.owner.kind)).toEqual([
      "visualField",
      "reportMeasure",
    ]);
  });
  it("says why each unresolved reference is unresolved", () => {
    expect(
      index
        .unresolved()
        .map((r) => [r.owner.kind, r.resolution.kind === "unresolved" ? r.resolution.reason : ""]),
    ).toEqual([
      ["pageFilter", 'no table named "Customer"'],
      ["visualField", '[Total Sales] is on "Sales", not "Product"'],
      ["visualField", 'no measure named "Profit" on "Sales"'],
      ["visualFilter", 'no column named "Nope" on "Sales"'],
      ["reportMeasure", 'no measure or column named "Missing"'],
    ]);
  });
  it("resolves a qualified reference to a report measure written inside another one", () => {
    expect(
      index.refs
        .filter((r) => r.owner.kind === "reportMeasure" && r.ref.name === "Net Margin")
        .map((r) => [r.ref.kind, r.resolution.kind]),
    ).toEqual([["measure", "reportMeasure"]]);
  });
  it("owns a visual's formatting and sort references as visualProperty, after its fields and filters", () => {
    const { report: formatted } = buildReport([
      { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "Overview" }) },
      {
        path: "definition/pages/p1/visuals/v/visual.json",
        text: j({
          name: "v",
          position: {},
          filterConfig: {
            filters: [{ name: "vf", field: column("Sales", "Region"), type: "Categorical" }],
          },
          visual: {
            visualType: "cardVisual",
            query: {
              queryState: { Data: { projections: [{ field: measure("Sales", "Total Sales") }] } },
              sortDefinition: { sort: [{ field: measure("Sales", "Total Sales") }] },
            },
            objects: {
              labels: [
                {
                  properties: { color: { solid: { color: { expr: measure("Sales", "Colour") } } } },
                },
              ],
            },
          },
        }),
      },
    ]);
    const idx = buildReportReferenceIndex(formatted, model);
    expect(idx.refs.map((r) => [r.owner.kind, r.ref.name, r.resolution.kind])).toEqual([
      ["visualField", "Total Sales", "measure"],
      ["visualFilter", "Region", "column"],
      ["visualProperty", "Total Sales", "measure"],
      ["visualProperty", "Colour", "unresolved"],
    ]);
    const v = formatted.pages[0]!.visuals[0]!;
    expect(idx.refs.every((r) => r.owner.object === v)).toBe(true);
    // fieldsOf stays the role bindings.
    expect(idx.fieldsOf(v).map((r) => r.owner.kind)).toEqual(["visualField"]);
  });
  it("marks everything unresolved with one reason when there is no model, except report measures", () => {
    const without = buildReportReferenceIndex(report, undefined);
    const kinds = new Set(without.refs.map((r) => r.resolution.kind));
    expect([...kinds].sort()).toEqual(["reportMeasure", "unresolved"]);
    expect(without.unresolved()[0]!.resolution).toEqual({
      kind: "unresolved",
      reason: "no model in the input",
    });
  });
});

// Desktop's own local date table, as tvw-baseline carries it, behind a date column's variation.
const LDT = "LocalDateTable_1b2c1fde-0cf3-455e-bfee-a8e4970804e0";
const localDateTable = readFileSync(
  `${fixturesDir}tvw-baseline.SemanticModel/definition/tables/${LDT}.tmdl`,
  "utf8",
);
const dated = modelFrom(`table Sales
	column OrderDate
		dataType: dateTime

		variation Variation
			isDefault
			defaultHierarchy: ${LDT}.'Date Hierarchy'

	column DueDate
		dataType: dateTime

		variation Variation
			isDefault
			defaultHierarchy: LocalDateTable_gone.'Date Hierarchy'

	column ShipDate
		dataType: dateTime

		variation Variation
			isDefault

${localDateTable}`);
const variationOf = (property: string, name = "Variation") => ({
  PropertyVariationSource: {
    Expression: { SourceRef: { Entity: "Sales" } },
    Name: name,
    Property: property,
  },
});
const dateLevel = (
  property: string,
  level: string,
  { variation = "Variation", hierarchy = "Date Hierarchy" } = {},
) => ({
  HierarchyLevel: {
    Expression: {
      Hierarchy: { Expression: variationOf(property, variation), Hierarchy: hierarchy },
    },
    Level: level,
  },
});
/** The resolutions of the given fields, bound in one visual's roles, against the dated model. */
const resolutionsOf = (...fields: unknown[]) => {
  const { report: r } = buildReport([
    { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "P" }) },
    {
      path: "definition/pages/p1/visuals/v1/visual.json",
      text: j({
        name: "v1",
        position: {},
        visual: {
          visualType: "clusteredColumnChart",
          query: { queryState: { Category: { projections: fields.map((field) => ({ field })) } } },
        },
      }),
    },
  ]);
  return buildReportReferenceIndex(r, dated).refs.map((x) => x.resolution);
};
const reasonOf = (res: Resolution): string => (res.kind === "unresolved" ? res.reason : res.kind);

describe("a reference through a date column's variation (Desktop's auto date/time)", () => {
  it("resolves to the local date table's hierarchy level, remembering the date column", () => {
    const [year] = resolutionsOf(dateLevel("OrderDate", "Year"));
    if (year?.kind !== "hierarchy") throw new Error(`resolved to ${year?.kind}`);
    expect([year.hierarchy.table.name, year.hierarchy.name, year.level?.name]).toEqual([
      LDT,
      "Date Hierarchy",
      "Year",
    ]);
    expect(year.variationOf?.name).toBe("OrderDate");
    expect(year.variationOf?.table.name).toBe("Sales");
  });
  it("resolves a column read through the variation to the local date table's column", () => {
    const [quarter] = resolutionsOf({
      Column: { Expression: variationOf("OrderDate"), Property: "Quarter" },
    });
    if (quarter?.kind !== "column") throw new Error(`resolved to ${quarter?.kind}`);
    expect([quarter.column.table.name, quarter.column.name]).toEqual([LDT, "Quarter"]);
    expect(quarter.variationOf?.name).toBe("OrderDate");
  });
  it("says which step is missing: the column, the variation, the hierarchy, or the level", () => {
    expect(
      resolutionsOf(
        dateLevel("Nope", "Year"),
        dateLevel("OrderDate", "Year", { variation: "Other" }),
        dateLevel("ShipDate", "Year"),
        dateLevel("DueDate", "Year"),
        dateLevel("OrderDate", "Year", { hierarchy: "Fiscal" }),
        dateLevel("OrderDate", "Week"),
      ).map(reasonOf),
    ).toEqual([
      'no column named "Nope" on "Sales"',
      'no variation named "Other" on column "OrderDate" of "Sales"',
      'variation "Variation" on column "ShipDate" of "Sales" names no default hierarchy',
      'no table named "LocalDateTable_gone"',
      `no hierarchy named "Fiscal" on "${LDT}"`,
      `no level named "Week" in hierarchy "Date Hierarchy" on "${LDT}"`,
    ]);
  });
  it("keeps the undeclared-alias reason for an undeclared alias, and names the other empty sources", () => {
    const aliased = (source: string) => ({
      Column: { Expression: { SourceRef: { Source: source } }, Property: "OrderDate" },
    });
    const { report: r } = buildReport([
      {
        path: "definition/pages/p1/page.json",
        text: j({
          name: "p1",
          displayName: "P",
          filterConfig: {
            filters: [
              {
                name: "f",
                type: "Advanced",
                filter: {
                  From: [{ Name: "sub", Expression: { Subquery: {} }, Type: 2 }],
                  Where: [
                    { Condition: { Not: { Expression: aliased("d") } } },
                    { Condition: { Not: { Expression: aliased("sub") } } },
                    { Condition: { Not: { Expression: { Column: { Property: "OrderDate" } } } } },
                  ],
                },
              },
            ],
          },
        }),
      },
    ]);
    expect(buildReportReferenceIndex(r, dated).refs.map((x) => reasonOf(x.resolution))).toEqual([
      "a filter alias that no From list declares",
      "an alias whose From entry names no model table",
      "a source that names no model table",
    ]);
  });
});
