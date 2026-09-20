import { describe, expect, it } from "vitest";
import { buildReportReferenceIndex } from "../src/index/report-refs.js";
import { buildReport } from "../src/pbir/build.js";
import { modelFrom } from "./helpers.js";

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
    expect(index.fieldsOf(v1).map((r) => [r.owner.role, r.resolution.kind])).toEqual([
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
