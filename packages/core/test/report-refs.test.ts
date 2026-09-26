import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReportReferenceIndex, type Resolution } from "../src/index/report-refs.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { buildReport } from "../src/pbir/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";
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

describe("a reference that names the report's extension schema", () => {
  // Desktop writes `"Schema": "extension"` in every reference to a report measure, and Microsoft's
  // reportExtension schema says to leave the schema empty for a model measure.
  const inExtension = (kind: "Measure" | "Column", entity: string, property: string) => ({
    [kind]: {
      Expression: { SourceRef: { Schema: "extension", Entity: entity } },
      Property: property,
    },
  });
  /** A reportExtensions.json defining `measures` on Sales, each with `expression`. */
  const extensionsText = (measures: string[], expression = "1") =>
    j({
      name: "extension",
      entities: [{ name: "Sales", measures: measures.map((name) => ({ name, expression })) }],
    });
  /** A card bound to the given fields, with reportExtensions.json's text, or no such file. */
  const indexWith = (fields: unknown[], extensions: string | undefined, m: Model | undefined) => {
    const { report: r } = buildReport([
      { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "P" }) },
      {
        path: "definition/pages/p1/visuals/v1/visual.json",
        text: j({
          name: "v1",
          position: {},
          visual: {
            visualType: "cardVisual",
            query: { queryState: { Data: { projections: fields.map((field) => ({ field })) } } },
          },
        }),
      },
      ...(extensions === undefined
        ? []
        : [{ path: "definition/reportExtensions.json", text: extensions }]),
    ]);
    return buildReportReferenceIndex(r, m);
  };
  /** A card bound to the given fields, with reportExtensions.json defining `measures` on Sales. */
  const indexOf = (fields: unknown[], measures: string[], m: Model = model) =>
    indexWith(fields, extensionsText(measures), m);
  /** The model the report reads, after Net Margin moved into it. */
  const moved = modelFrom(`table Sales
	column Amount
		dataType: decimal
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Net Margin' = [Total Sales] * 0.1
`);

  it("resolves to the report's measure while reportExtensions.json defines it", () => {
    const [ref] = indexOf([inExtension("Measure", "Sales", "Net Margin")], ["Net Margin"]).refs;
    expect(ref!.resolution.kind).toBe("reportMeasure");
  });
  it("resolves to the report's measure with no model in the run", () => {
    const [ref] = indexWith(
      [inExtension("Measure", "Sales", "Net Margin")],
      extensionsText(["Net Margin"]),
      undefined,
    ).refs;
    expect(ref!.resolution.kind).toBe("reportMeasure");
  });
  it("is unresolved once the measure is gone from reportExtensions.json, though the model has it", () => {
    const index = indexOf(
      [inExtension("Measure", "Sales", "Net Margin"), measure("Sales", "Net Margin")],
      [],
      moved,
    );
    expect(index.refs.map((r) => reasonOf(r.resolution))).toEqual([
      `no measure named "Net Margin" on "Sales" in the report's extension`,
      "measure",
    ]);
  });
  it("says the report's extension defines measures only, for a column that names it", () => {
    const index = indexOf([inExtension("Column", "Sales", "Amount")], ["Net Margin"], moved);
    expect(index.refs.map((r) => reasonOf(r.resolution))).toEqual([
      `the report's extension defines only measures, so no column named "Amount" on "Sales"`,
    ]);
  });
  it("is unread, and not unresolved, while reportExtensions.json cannot be read", () => {
    // Both sides of the merge define Net Margin; pbiplint reads neither, so it cannot say either way.
    const conflicted = [
      "<<<<<<< HEAD",
      extensionsText(["Net Margin"], "[Total Sales] * 0.1"),
      "=======",
      extensionsText(["Net Margin"], "[Total Sales] * 0.2"),
      ">>>>>>> main",
    ].join("\n");
    const index = indexWith(
      [
        inExtension("Measure", "Sales", "Net Margin"),
        inExtension("Column", "Sales", "Amount"),
        measure("Sales", "Total Sales"),
      ],
      conflicted,
      moved,
    );
    const unread = { kind: "unread", reason: "reportExtensions.json could not be read" };
    expect(index.refs.map((r) => r.resolution)).toEqual([
      unread,
      unread,
      expect.objectContaining({ kind: "measure" }),
    ]);
    expect(index.unresolved()).toEqual([]);
  });
  it("says the report defines no extension measures when the input holds no reportExtensions.json", () => {
    const index = indexWith([inExtension("Measure", "Sales", "Net Margin")], undefined, moved);
    expect(index.refs.map((r) => r.resolution)).toEqual([
      {
        kind: "unresolved",
        reason: `no measure named "Net Margin" on "Sales": the report defines no extension measures`,
      },
    ]);
  });
});

describe("a reference into a model file pbiplint could not fully read", () => {
  const SALES = "definition/tables/Sales.tmdl";
  const PRODUCT = "definition/tables/Product.tmdl";
  const sales = `table Sales
	column Amount
		dataType: decimal
	column Region
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	hierarchy Geography
		level Region
			column: Region
`;
  const product = `table Product
	column Category
		dataType: string
`;
  /** A line indented with spaces, which the parser skips, so what it declares is not read. */
  const spaced = "    column Lost\n";
  /** A model read through the parser from TMDL files by path. */
  const modelOf = (files: Record<string, string>): Model =>
    buildModel(Object.entries(files).map(([path, text]) => parseTmdl(path, text)));
  const level = (entity: string, hierarchy: string, name: string) => ({
    HierarchyLevel: {
      Expression: {
        Hierarchy: { Expression: { SourceRef: { Entity: entity } }, Hierarchy: hierarchy },
      },
      Level: name,
    },
  });
  /** A card bound to the given fields, and report measures on Sales with the given DAX. */
  const indexOf = (m: Model, fields: unknown[], measures: Record<string, string> = {}) => {
    const { report: r } = buildReport([
      { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "P" }) },
      {
        path: "definition/pages/p1/visuals/v1/visual.json",
        text: j({
          name: "v1",
          position: {},
          visual: {
            visualType: "cardVisual",
            query: { queryState: { Data: { projections: fields.map((field) => ({ field })) } } },
          },
        }),
      },
      ...(Object.keys(measures).length
        ? [
            {
              path: "definition/reportExtensions.json",
              text: j({
                entities: [
                  {
                    name: "Sales",
                    measures: Object.entries(measures).map(([name, expression]) => ({
                      name,
                      expression,
                    })),
                  },
                ],
              }),
            },
          ]
        : []),
    ]);
    return buildReportReferenceIndex(r, m);
  };
  const resolutions = (m: Model, ...fields: unknown[]): Resolution[] =>
    indexOf(m, fields).refs.map((r) => r.resolution);
  const unread = (reason: string): Resolution => ({ kind: "unread", reason });
  const unresolved = (reason: string): Resolution => ({ kind: "unresolved", reason });
  const partly = (what: string, file = "a model file") =>
    `${what}, and ${file} could not be fully read`;

  it("is unread when a misspelt keyword took the table out of the model", () => {
    const m = modelOf({ [SALES]: sales.replace("table Sales", "tabel Sales"), [PRODUCT]: product });
    expect(m.files.flatMap((f) => f.issues).map((i) => [i.file, i.line])).toEqual([[SALES, 1]]);
    const index = indexOf(m, [column("Sales", "Amount"), measure("Sales", "Total Sales")]);
    expect(index.refs.map((r) => r.resolution)).toEqual([
      unread(partly('no table named "Sales"')),
      unread(partly('no table named "Sales"')),
    ]);
    expect(index.unresolved()).toEqual([]);
  });

  it("is unread when a missing field's table has, in its own file, a line indented with spaces", () => {
    const m = modelOf({
      [SALES]: sales.replace("\tcolumn Amount\n", "    column Amount\n"),
      [PRODUCT]: product,
    });
    expect(
      resolutions(
        m,
        column("Sales", "Amount"),
        measure("Sales", "Profit"),
        level("Sales", "Calendar", "Year"),
        level("Sales", "Geography", "Country"),
      ),
    ).toEqual([
      unread(partly('no column named "Amount" on "Sales"', SALES)),
      unread(partly('no measure named "Profit" on "Sales"', SALES)),
      unread(partly('no hierarchy named "Calendar" on "Sales"', SALES)),
      unread(partly('no level named "Country" in hierarchy "Geography" on "Sales"', SALES)),
    ]);
  });

  it("is unread when an unterminated code fence swallows a measure in its table's file", () => {
    const m = modelOf({
      [SALES]: sales.replace(
        "\tmeasure 'Total Sales' = SUM('Sales'[Amount])\n",
        "\tmeasure 'Total Sales' = ```\n\t\t\tSUM('Sales'[Amount])\n\tmeasure Profit = [Total Sales] * 0.1\n",
      ),
    });
    expect(m.files[0]!.issues.map((i) => i.reason)).toEqual(["unterminated code fence"]);
    expect(resolutions(m, measure("Sales", "Profit"))).toEqual([
      unread(partly('no measure named "Profit" on "Sales"', SALES)),
    ]);
  });

  it("is unread when a line the parser does not recognize stands in its table's file", () => {
    // The column's keyword is gone, so the line declares nothing the parser can read.
    const m = modelOf({ [SALES]: sales.replace("\tcolumn Amount\n", "\t'Amount'\n") });
    expect(m.files[0]!.issues.map((i) => i.reason)).toContain("unrecognized line");
    expect(resolutions(m, column("Sales", "Amount"))).toEqual([
      unread(partly('no column named "Amount" on "Sales"', SALES)),
    ]);
  });

  it("stays unresolved on a table whose own file was read in full, whatever a line nested in another file loses", () => {
    const m = modelOf({ [SALES]: sales, [PRODUCT]: product + spaced });
    expect(resolutions(m, column("Sales", "Nope"), column("Product", "Gone"))).toEqual([
      unresolved('no column named "Nope" on "Sales"'),
      unread(partly('no column named "Gone" on "Product"', PRODUCT)),
    ]);
  });

  it("counts each file that declares the table, as the model merges a table declared twice", () => {
    const m = modelOf({
      [SALES]: sales,
      "definition/tables/More Sales.tmdl": `table Sales\n${spaced}`,
    });
    expect(resolutions(m, column("Sales", "Nope"))).toEqual([
      unread(partly('no column named "Nope" on "Sales"', "definition/tables/More Sales.tmdl")),
    ]);
  });

  it("counts a file whose issue can take a line at the root with it for every table, since that line could declare one", () => {
    const MEASURES = "definition/tables/measures.tmdl";
    const lost = "tabel Sales\n\tmeasure Profit = 1\n";
    expect(
      resolutions(modelOf({ [SALES]: sales, [MEASURES]: lost }), measure("Sales", "Profit")),
    ).toEqual([unread(partly('no measure named "Profit" on "Sales"', MEASURES))]);
    // A file that declares the table and could not be fully read is named first.
    expect(
      resolutions(
        modelOf({ [MEASURES]: lost, [SALES]: sales + spaced }),
        measure("Sales", "Profit"),
      ),
    ).toEqual([unread(partly('no measure named "Profit" on "Sales"', SALES))]);
  });

  it("stays unresolved while the only parse issue is an orphaned description, which drops no declaration", () => {
    const m = modelOf({
      [SALES]: sales.replace("\tcolumn Region\n", "\t/// Described\n\n\tcolumn Region\n"),
      [PRODUCT]: product,
    });
    expect(m.files.flatMap((f) => f.issues).map((i) => i.reason)).toEqual([
      "description is not followed by a declaration",
    ]);
    expect(resolutions(m, column("Store", "City"), column("Sales", "Nope"))).toEqual([
      unresolved('no table named "Store"'),
      unresolved('no column named "Nope" on "Sales"'),
    ]);
  });

  it("still says a measure is not a column, and names the table a measure is on, while the files are partly read", () => {
    // A column cannot share a name with a measure on its table, and a measure's name is unique in
    // the model, so no line pbiplint could not read can hold the column or the measure asked for.
    const m = modelOf({ [SALES]: sales + spaced, [PRODUCT]: product + spaced });
    expect(
      resolutions(m, column("Sales", "Total Sales"), measure("Product", "Total Sales")),
    ).toEqual([
      unresolved('"Total Sales" is a measure on "Sales", not a column'),
      unresolved('[Total Sales] is on "Sales", not "Product"'),
    ]);
  });

  describe("a path the input reader could not read at all", () => {
    const STORE = "definition/tables/Store.tmdl";
    const never = (what: string, path = STORE) => `${what}, and ${path} could not be read`;
    /** The model of the files given, read beside the paths the input reader could not read. */
    const modelBeside = (files: Record<string, string>, unreadPaths: string[]): Model =>
      buildModel(
        Object.entries(files).map(([path, text]) => parseTmdl(path, text)),
        unreadPaths,
      );

    it("could declare any table, and anything under any table, so a missing one is unread", () => {
      const m = modelBeside({ [SALES]: sales, [PRODUCT]: product }, [STORE]);
      expect(m.unreadPaths).toEqual([STORE]);
      // No parse issue: the input reader's notice names the path.
      expect(m.files.flatMap((f) => f.issues)).toEqual([]);
      expect(
        resolutions(
          m,
          column("Store", "City"),
          column("Sales", "Nope"),
          level("Sales", "Geography", "Country"),
          measure("Product", "Profit"),
        ),
      ).toEqual([
        unread(never('no table named "Store"')),
        unread(never('no column named "Nope" on "Sales"')),
        unread(never('no level named "Country" in hierarchy "Geography" on "Sales"')),
        unread(never('no measure named "Profit" on "Product"')),
      ]);
      // A folder stands for every file it could hold.
      expect(
        resolutions(
          modelBeside({ [SALES]: sales }, ["definition/tables/"]),
          column("Store", "City"),
        ),
      ).toEqual([unread(never('no table named "Store"', "definition/tables/"))]);
    });

    it("still says a measure is not a column, and names the table a measure is on", () => {
      const m = modelBeside({ [SALES]: sales, [PRODUCT]: product }, [STORE]);
      expect(
        resolutions(m, column("Sales", "Total Sales"), measure("Product", "Total Sales")),
      ).toEqual([
        unresolved('"Total Sales" is a measure on "Sales", not a column'),
        unresolved('[Total Sales] is on "Sales", not "Product"'),
      ]);
    });

    it("names a file that declares the table and could not be fully read first", () => {
      const m = modelBeside({ [SALES]: sales + spaced, [PRODUCT]: product }, [STORE]);
      expect(resolutions(m, column("Sales", "Nope"), column("Product", "Gone"))).toEqual([
        unread(partly('no column named "Nope" on "Sales"', SALES)),
        unread(never('no column named "Gone" on "Product"')),
      ]);
    });

    it("reads a report measure's bare name as unread, since the path could declare it on any table", () => {
      const m = modelBeside({ [SALES]: sales }, [STORE]);
      expect(
        indexOf(m, [], { "Net Margin": "[Missing]" })
          .refs.filter((r) => r.owner.kind === "reportMeasure")
          .map((r) => r.resolution),
      ).toEqual([unread(never('no measure or column named "Missing"'))]);
    });

    it("counts only a .tmdl file or a folder, the paths that could hold a declaration", () => {
      const m = modelBeside({ [SALES]: sales }, [".platform", "definition.pbism", "notes.txt"]);
      expect(m.unreadPaths).toEqual([]);
      expect(resolutions(m, column("Store", "City"))).toEqual([
        unresolved('no table named "Store"'),
      ]);
    });
  });

  it("reads a report measure's DAX by the same conditions, a bare name against every model file", () => {
    const dax = { "Net Margin": "[Total Sales] - [Missing] + 'Sales'[Gone]" };
    const refsOf = (m: Model) =>
      indexOf(m, [], dax)
        .refs.filter((r) => r.owner.kind === "reportMeasure")
        .map((r) => [r.ref.name, r.resolution.kind === "measure" ? "measure" : r.resolution]);
    // A bare [Missing] could be a measure on any table, so another table's file is enough.
    expect(refsOf(modelOf({ [SALES]: sales, [PRODUCT]: product + spaced }))).toEqual([
      ["Gone", unresolved('no column named "Gone" on "Sales"')],
      ["Total Sales", "measure"],
      ["Missing", unread(partly('no measure or column named "Missing"'))],
    ]);
    expect(refsOf(modelOf({ [SALES]: sales + spaced, [PRODUCT]: product }))).toEqual([
      ["Gone", unread(partly('no column named "Gone" on "Sales"', SALES))],
      ["Total Sales", "measure"],
      ["Missing", unread(partly('no measure or column named "Missing"'))],
    ]);
  });

  describe("through a date column's variation", () => {
    const LDT_FILE = `definition/tables/${LDT}.tmdl`;
    const datedSales = `table Sales
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
`;
    const steps = [
      dateLevel("Nope", "Year"),
      dateLevel("OrderDate", "Year", { variation: "Other" }),
      dateLevel("ShipDate", "Year"),
      dateLevel("DueDate", "Year"),
      dateLevel("OrderDate", "Year", { hierarchy: "Fiscal" }),
      dateLevel("OrderDate", "Week"),
    ];
    it("follows the table each missing step would sit in, when the date column's file is partly read", () => {
      const m = modelOf({ [SALES]: datedSales + spaced, [LDT_FILE]: localDateTable });
      expect(resolutions(m, ...steps)).toEqual([
        unread(partly('no column named "Nope" on "Sales"', SALES)),
        unread(partly('no variation named "Other" on column "OrderDate" of "Sales"', SALES)),
        unread(
          partly(
            'variation "Variation" on column "ShipDate" of "Sales" names no default hierarchy',
            SALES,
          ),
        ),
        unread(partly('no table named "LocalDateTable_gone"')),
        unresolved(`no hierarchy named "Fiscal" on "${LDT}"`),
        unresolved(`no level named "Week" in hierarchy "Date Hierarchy" on "${LDT}"`),
      ]);
    });
    it("follows the table each missing step would sit in, when the local date table's file is partly read", () => {
      const m = modelOf({ [SALES]: datedSales, [LDT_FILE]: localDateTable + spaced });
      expect(resolutions(m, ...steps)).toEqual([
        unresolved('no column named "Nope" on "Sales"'),
        unresolved('no variation named "Other" on column "OrderDate" of "Sales"'),
        unresolved(
          'variation "Variation" on column "ShipDate" of "Sales" names no default hierarchy',
        ),
        unread(partly('no table named "LocalDateTable_gone"')),
        unread(partly(`no hierarchy named "Fiscal" on "${LDT}"`, LDT_FILE)),
        unread(partly(`no level named "Week" in hierarchy "Date Hierarchy" on "${LDT}"`, LDT_FILE)),
      ]);
    });
  });
});
