import { describe, expect, it } from "vitest";
import { buildReport, holdsFieldReferences, KNOWN_SCHEMAS, literal } from "../src/pbir/build.js";
import { fieldFileUnread, visualFileUnread } from "../src/rules/report-helpers.js";

const schema = (family: string, version: string) =>
  `https://developer.microsoft.com/json-schemas/fabric/item/report/definition/${family}/${version}/schema.json`;
const j = (v: unknown) => JSON.stringify(v, null, 2);
const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const lit = (value: string) => ({ expr: { Literal: { Value: value } } });

const reportJson = j({
  $schema: schema("report", "3.2.0"),
  themeCollection: { baseTheme: { name: "Fluent2-CY26SU04", type: "SharedResources" } },
  objects: { outspacePane: [{ properties: { expanded: lit("true") } }] },
  publicCustomVisuals: ["ChicletSlicer1448559807354"],
  filterConfig: { filters: [{ name: "rf", field: column("Date", "Year"), type: "Categorical" }] },
  settings: { filterPaneHiddenInEditMode: true },
});
const pagesJson = j({
  $schema: schema("pagesMetadata", "1.1.0"),
  pageOrder: ["p2", "p1"],
  activePageName: "p1",
  landingPageName: "p2",
});
const page = (name: string, extra: Record<string, unknown> = {}) =>
  j({
    $schema: schema("page", "2.1.0"),
    name,
    displayName: `Page ${name}`,
    displayOption: "FitToPage",
    height: 720,
    width: 1280,
    ...extra,
  });
const visual = (
  name: string,
  extra: Record<string, unknown> = {},
  inner: Record<string, unknown> = {},
) =>
  j({
    $schema: schema("visualContainer", "2.8.0"),
    name,
    position: { x: 10, y: 20, z: 1000, height: 100, width: 200, tabOrder: 1000 },
    ...extra,
    visual: {
      visualType: "clusteredBarChart",
      query: {
        queryState: {
          Category: { projections: [{ field: column("Product", "Category") }], showAll: true },
          Y: {
            projections: [
              {
                field: {
                  Measure: {
                    Expression: { SourceRef: { Entity: "Sales" } },
                    Property: "Total Sales",
                  },
                },
              },
            ],
          },
        },
      },
      visualContainerObjects: {
        title: [{ properties: { text: lit("'Sales by category'") } }],
        general: [{ properties: { altText: lit("'Bar chart of sales by category'") } }],
        visualLink: [
          { properties: { type: lit("'PageNavigation'"), navigationSection: lit("'p2'") } },
        ],
      },
      ...inner,
    },
  });

const files = [
  {
    path: "definition.pbir",
    text: j({ version: "4.0", datasetReference: { byPath: { path: "../Demo.SemanticModel" } } }),
  },
  {
    path: ".platform",
    text: j({ metadata: { type: "Report", displayName: "Demo" }, config: { version: "2.0" } }),
  },
  { path: "definition/report.json", text: reportJson },
  { path: "definition/pages/pages.json", text: pagesJson },
  {
    path: "definition/pages/p1/page.json",
    text: page("p1", {
      visibility: "HiddenInViewMode",
      type: "Tooltip",
      pageBinding: { type: "Tooltip", parameters: [{ field: column("Product", "Category") }] },
      filterConfig: {
        filters: [
          {
            name: "pf",
            field: column("Customer", "Segment"),
            type: "Advanced",
            filter: { From: [{ Name: "c", Entity: "Customer" }], Where: [] },
          },
        ],
      },
      annotations: [{ name: "pbiplint.ignore", value: "X" }],
    }),
  },
  { path: "definition/pages/p2/page.json", text: page("p2") },
  {
    path: "definition/pages/p1/visuals/v1/visual.json",
    text: visual("v1", {
      isHidden: true,
      filterConfig: {
        filters: [{ name: "vf", field: column("Product", "Brand"), type: "Categorical" }],
      },
    }),
  },
  {
    path: "definition/pages/p1/visuals/v1/mobile.json",
    text: j({
      $schema: schema("visualContainerMobileState", "1.4.0"),
      position: { x: 0, y: 0, z: 0, height: 1, width: 1 },
    }),
  },
  {
    path: "definition/pages/p2/visuals/v2/visual.json",
    text: visual(
      "v2",
      { parentGroupName: "g1" },
      {
        visualContainerObjects: {
          general: [
            {
              properties: {
                altText: {
                  expr: {
                    Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Alt" },
                  },
                },
              },
            },
          ],
        },
      },
    ),
  },
  {
    path: "definition/pages/p2/visuals/g1/visual.json",
    text: j({
      $schema: schema("visualContainer", "2.8.0"),
      name: "g1",
      position: { x: 0, y: 0, z: 0, height: 1, width: 1, tabOrder: 0 },
      visualGroup: { displayName: "Group", groupMode: "ScaleMode" },
    }),
  },
  {
    path: "definition/bookmarks/bookmarks.json",
    // Desktop and Microsoft's bookmarksMetadata schema list a group's children by bookmark name.
    text: j({ items: [{ name: "b1", displayName: "Group", children: ["b2"] }] }),
  },
  {
    path: "definition/bookmarks/b1.bookmark.json",
    text: j({
      name: "b1",
      displayName: "Reset",
      explorationState: {
        activeSection: "p1",
        sections: { p1: { visualContainers: { v1: {}, gone: {} } } },
      },
    }),
  },
  {
    path: "definition/reportExtensions.json",
    text: '{\n  "name": "extension",\n  "entities": [\n    {\n      "name": "Sales",\n      "measures": [\n        { "name": "Net Margin", "expression": "[Total Sales] - [Total Cost]", "hidden": false },\n        { "name": "Margin %", "expression": "DIVIDE([Net Margin], [Total Sales])" }\n      ]\n    }\n  ]\n}',
  },
];

describe("buildReport", () => {
  const { report, diagnostics } = buildReport(files);
  it("reads the report file, the pane state, custom visuals, filters, and the dataset reference", () => {
    expect(report.displayName).toBe("Demo");
    expect(report.file).toBe("definition/report.json");
    expect(report.schemaVersion).toBe("3.2.0");
    expect(report.themeName).toBe("Fluent2-CY26SU04");
    expect(report.publicCustomVisuals).toEqual(["ChicletSlicer1448559807354"]);
    expect(report.filtersPane).toEqual({
      expanded: true,
      visible: undefined,
      hiddenInEditMode: true,
    });
    expect(report.filters.map((f) => [f.name, f.type, f.applied, f.field?.name])).toEqual([
      ["rf", "Categorical", false, "Year"],
    ]);
    expect(report.datasetReference).toEqual({ kind: "byPath", path: "../Demo.SemanticModel" });
    expect(report.files).toHaveLength(files.length);
    expect(report.issues).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
  it("orders pages by pageOrder and reads their header, type, binding, filters, and annotations", () => {
    expect(report.pagesHeader).toEqual({
      file: "definition/pages/pages.json",
      text: pagesJson,
      pageOrder: ["p2", "p1"],
      activePageName: "p1",
      landingPageName: "p2",
    });
    expect(report.pages.map((p) => p.id)).toEqual(["p2", "p1"]);
    const p1 = report.pages[1]!;
    expect(p1.displayName).toBe("Page p1");
    expect(p1.visibility).toBe("HiddenInViewMode");
    // page.json's own `type`, apart from its pageBinding's; p2 sets neither.
    expect(p1.type).toBe("Tooltip");
    expect(report.pages[0]!.type).toBeUndefined();
    expect(p1.bindingType).toBe("Tooltip");
    expect(p1.bindingRefs.map((r) => r.name)).toEqual(["Category"]);
    expect(p1.filters.map((f) => [f.type, f.applied])).toEqual([["Advanced", true]]);
    expect(p1.annotations).toEqual({ "pbiplint.ignore": "X" });
    expect(p1.file).toBe("definition/pages/p1/page.json");
    expect(report.schemaVersions).toEqual({ report: "3.2.0", page: "2.1.0", visual: "2.8.0" });
  });
  it("orders pages by the name each page.json gives, while a visual joins its page by folder", () => {
    // Learn: renaming a page's `name` is supported, and Desktop keeps the folder; pages.json,
    // bookmarks, and actions follow the name.
    const { report: renamed } = buildReport([
      {
        path: "definition/pages/pages.json",
        text: j({ pageOrder: ["page_dashboard", "p1", "page_dashboard"] }),
      },
      { path: "definition/pages/p1/page.json", text: page("p1") },
      { path: "definition/pages/646039348818b651e02c/page.json", text: page("page_dashboard") },
      { path: "definition/pages/646039348818b651e02c/visuals/v/visual.json", text: visual("v") },
      { path: "definition/pages/zz/page.json", text: page("zz") },
    ]);
    // A page pageOrder lists twice comes out once; one it does not list comes after.
    expect(renamed.pages.map((p) => [p.id, p.file, p.visuals.map((v) => v.id)])).toEqual([
      ["page_dashboard", "definition/pages/646039348818b651e02c/page.json", ["v"]],
      ["p1", "definition/pages/p1/page.json", []],
      ["zz", "definition/pages/zz/page.json", []],
    ]);
  });
  it("reads a visual's type, position, fields per role, showAll, title, alt text, actions, filters, and mobile layout", () => {
    const v1 = report.pages[1]!.visuals[0]!;
    expect(v1.id).toBe("v1");
    expect(v1.page.id).toBe("p1");
    expect(v1.type).toBe("clusteredBarChart");
    expect(v1.position).toEqual({ x: 10, y: 20, z: 1000, height: 100, width: 200, tabOrder: 1000 });
    expect(v1.isHidden).toBe(true);
    expect(v1.fields.map((f) => [f.role, f.ref.kind, f.ref.table, f.ref.name])).toEqual([
      ["Category", "column", "Product", "Category"],
      ["Y", "measure", "Sales", "Total Sales"],
    ]);
    expect(v1.fields[0]!.ref.pointer).toBe("/visual/query/queryState/Category/projections/0/field");
    expect(v1.projectionCount).toBe(2);
    expect(v1.showAllRoles).toEqual(["Category"]);
    expect(v1.title).toBe("Sales by category");
    expect(v1.altText).toBe("Bar chart of sales by category");
    expect(v1.actions).toEqual([
      {
        type: "PageNavigation",
        on: true,
        target: "p2",
        pointer: "/visual/visualContainerObjects/visualLink/0/properties/navigationSection",
      },
    ]);
    expect(v1.filters.map((f) => f.name)).toEqual(["vf"]);
    expect(v1.hasMobileLayout).toBe(true);
    expect(v1.file).toBe("definition/pages/p1/visuals/v1/visual.json");
  });
  it("reads an action's destination only from the property its type owns, and whether it is on", () => {
    const entry = (properties: Record<string, unknown>) => ({ properties });
    const { report: linked } = buildReport([
      { path: "definition/pages/p1/page.json", text: page("p1") },
      {
        path: "definition/pages/p1/visuals/b/visual.json",
        text: j({
          $schema: schema("visualContainer", "2.8.0"),
          name: "b",
          position: { x: 0, y: 0, z: 0, height: 40, width: 120, tabOrder: 0 },
          visual: {
            visualType: "actionButton",
            visualContainerObjects: {
              visualLink: [
                // A bookmark left behind when the type became PageNavigation is not its target.
                entry({
                  show: lit("true"),
                  type: lit("'PageNavigation'"),
                  navigationSection: lit("'p2'"),
                  bookmark: lit("'b9'"),
                }),
                // Switched off.
                entry({ show: lit("false"), type: lit("'Bookmark'"), bookmark: lit("'b1'") }),
                // A destination set by conditional formatting.
                entry({
                  type: lit("'PageNavigation'"),
                  navigationSection: {
                    expr: {
                      Measure: {
                        Expression: { SourceRef: { Entity: "Sales" } },
                        Property: "Destination",
                      },
                    },
                  },
                }),
                // An empty destination.
                entry({ type: lit("'PageNavigation'"), navigationSection: lit("''") }),
                // No property of its own, only another type's.
                entry({ type: lit("'Bookmark'"), navigationSection: lit("'p2'") }),
                // The type is matched without regard to case.
                entry({ type: lit("'drillthrough'"), drillthroughSection: lit("'p1'") }),
                entry({ type: lit("'Back'") }),
                // No type: not an action.
                entry({ show: lit("true"), tooltip: lit("'Help'") }),
              ],
            },
          },
        }),
      },
    ]);
    const at = (i: number, property?: string) =>
      `/visual/visualContainerObjects/visualLink/${i}/properties${property ? `/${property}` : ""}`;
    expect(linked.pages[0]!.visuals[0]!.actions).toEqual([
      { type: "PageNavigation", on: true, target: "p2", pointer: at(0, "navigationSection") },
      { type: "Bookmark", on: false, target: "b1", pointer: at(1, "bookmark") },
      { type: "PageNavigation", on: true, conditional: true, pointer: at(2, "navigationSection") },
      { type: "PageNavigation", on: true, pointer: at(3, "navigationSection") },
      { type: "Bookmark", on: true, pointer: at(4) },
      { type: "drillthrough", on: true, target: "p1", pointer: at(5, "drillthroughSection") },
      { type: "Back", on: true, pointer: at(6) },
    ]);
  });
  it("marks a group, a member of a group, and an alt text bound to an expression", () => {
    const [g1, v2] = report.pages[0]!.visuals;
    expect(g1!.isGroup).toBe(true);
    expect(g1!.type).toBe("visualGroup");
    expect(g1!.projectionCount).toBe(0);
    expect(v2!.groupId).toBe("g1");
    expect(v2!.altText).toBe("(expression)");
    expect(v2!.hasMobileLayout).toBe(false);
    expect(v2!.isHidden).toBe(false);
  });
  it("reads a group's own alt text under visualGroup.objects, by the rules a visual's follows", () => {
    // A group's container has no `visual` key; its alt text sits in the group's own objects.
    const group = (name: string, altText?: unknown) => ({
      path: `definition/pages/p1/visuals/${name}/visual.json`,
      text: j({
        $schema: schema("visualContainer", "2.8.0"),
        name,
        position: { x: 0, y: 0, z: 0, height: 300, width: 400, tabOrder: 0 },
        visualGroup: {
          displayName: "Group 1",
          groupMode: "ScaleMode",
          ...(altText === undefined ? {} : { objects: { general: [{ properties: { altText } }] } }),
        },
      }),
    });
    const { report: grouped } = buildReport([
      { path: "definition/pages/p1/page.json", text: page("p1") },
      group("bound", {
        expr: { Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Alt" } },
      }),
      group("empty", lit("''")),
      group("none"),
      group("text", lit("'Sales overview: total sales and the monthly trend'")),
    ]);
    expect(grouped.pages[0]!.visuals.map((v) => [v.id, v.isGroup, v.altText])).toEqual([
      ["bound", true, "(expression)"],
      ["empty", true, undefined],
      ["none", true, undefined],
      ["text", true, "Sales overview: total sales and the monthly trend"],
    ]);
  });
  it("reads a visual's field references outside its wells and filters, each once, with its pointer", () => {
    const measure = (property: string) => ({
      Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: property },
    });
    const { report: formatted } = buildReport([
      { path: "definition/pages/p1/page.json", text: page("p1") },
      {
        path: "definition/pages/p1/visuals/v/visual.json",
        text: j({
          $schema: schema("visualContainer", "2.8.0"),
          name: "v",
          position: { x: 0, y: 0, z: 0, height: 100, width: 100, tabOrder: 0 },
          filterConfig: {
            filters: [
              {
                name: "vf",
                field: column("Product", "Brand"),
                type: "Categorical",
                filter: {
                  From: [{ Name: "p", Entity: "Product" }],
                  Where: [
                    {
                      Condition: {
                        In: {
                          Expressions: [
                            {
                              Column: {
                                Expression: { SourceRef: { Source: "p" } },
                                Property: "Brand",
                              },
                            },
                          ],
                          Values: [[lit("'A'")]],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
          visual: {
            visualType: "clusteredBarChart",
            query: {
              queryState: {
                Category: { projections: [{ field: column("Product", "Category") }] },
                Y: { projections: [{ field: measure("Total Sales") }] },
              },
              // The sort repeats a bound field; it is still a reference of its own, at its own line.
              sortDefinition: {
                sort: [{ field: measure("Total Sales"), direction: "Descending" }],
              },
            },
            objects: {
              dataPoint: [
                { properties: { fill: { solid: { color: { expr: measure("Colour") } } } } },
              ],
            },
            visualContainerObjects: {
              title: [{ properties: { text: { expr: measure("Title") } } }],
            },
          },
        }),
      },
      {
        path: "definition/pages/p1/visuals/g/visual.json",
        text: j({
          $schema: schema("visualContainer", "2.8.0"),
          name: "g",
          position: { x: 0, y: 0, z: 0, height: 100, width: 100, tabOrder: 0 },
          visualGroup: {
            displayName: "Group",
            groupMode: "ScaleMode",
            objects: { general: [{ properties: { altText: { expr: measure("Alt") } } }] },
          },
        }),
      },
    ]);
    const v = formatted.pages[0]!.visuals.find((x) => x.id === "v");
    const g = formatted.pages[0]!.visuals.find((x) => x.id === "g");
    const refs = (x: typeof v) => x!.propertyRefs.map((r) => [r.kind, r.table, r.name, r.pointer]);
    expect(refs(v)).toEqual([
      ["measure", "Sales", "Total Sales", "/visual/query/sortDefinition/sort/0/field"],
      [
        "measure",
        "Sales",
        "Colour",
        "/visual/objects/dataPoint/0/properties/fill/solid/color/expr",
      ],
      ["measure", "Sales", "Title", "/visual/visualContainerObjects/title/0/properties/text/expr"],
    ]);
    // The wells and the filters keep their own references; none is read twice.
    expect(v!.fields.map((f) => f.ref.name)).toEqual(["Category", "Total Sales"]);
    expect(v!.filters.flatMap((f) => f.refs.map((r) => r.name))).toEqual(["Brand", "Brand"]);
    expect(refs(g)).toEqual([
      ["measure", "Sales", "Alt", "/visualGroup/objects/general/0/properties/altText/expr"],
    ]);
    // A bound alt text is a reference too; a literal title is not.
    const [, v2] = report.pages[0]!.visuals;
    expect(refs(v2)).toEqual([
      [
        "measure",
        "Sales",
        "Alt",
        "/visual/visualContainerObjects/general/0/properties/altText/expr",
      ],
    ]);
    expect(report.pages[1]!.visuals[0]!.propertyRefs).toEqual([]);
  });
  it("reads a field parameter in a role as a property reference, and a projection only as a field", () => {
    const measure = (property: string) => ({
      Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: property },
    });
    const { report: parameterised } = buildReport([
      { path: "definition/pages/p1/page.json", text: page("p1") },
      {
        path: "definition/pages/p1/visuals/v/visual.json",
        text: j({
          $schema: schema("visualContainer", "2.8.0"),
          name: "v",
          position: { x: 0, y: 0, z: 0, height: 100, width: 100, tabOrder: 0 },
          visual: {
            visualType: "clusteredBarChart",
            query: {
              queryState: {
                Category: {
                  projections: [{ field: column("Product", "Category") }],
                  fieldParameters: [
                    { parameterExpr: column("Metric", "Metric"), index: 0, length: 1 },
                  ],
                },
                // An arithmetic projection holds its references below `field`.
                Y: {
                  projections: [
                    {
                      field: {
                        Arithmetic: {
                          Left: measure("Total Sales"),
                          Right: measure("Total Cost"),
                          Operator: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      },
    ]);
    const v = parameterised.pages[0]!.visuals[0]!;
    expect(v.propertyRefs.map((r) => [r.kind, r.table, r.name, r.pointer])).toEqual([
      [
        "column",
        "Metric",
        "Metric",
        "/visual/query/queryState/Category/fieldParameters/0/parameterExpr",
      ],
    ]);
    expect(v.fields.map((f) => [f.role, f.ref.name, f.ref.pointer])).toEqual([
      ["Category", "Category", "/visual/query/queryState/Category/projections/0/field"],
      ["Y", "Total Sales", "/visual/query/queryState/Y/projections/0/field/Arithmetic/Left"],
      ["Y", "Total Cost", "/visual/query/queryState/Y/projections/0/field/Arithmetic/Right"],
    ]);
  });
  it("reads bookmarks and their header, and report-level measures with their lines", () => {
    expect(report.bookmarksHeader.items).toEqual([{ name: "b1", children: ["b2"] }]);
    const b = report.bookmarks[0]!;
    expect([b.id, b.displayName, b.activePage, b.pages]).toEqual(["b1", "Reset", "p1", ["p1"]]);
    expect(b.visuals).toEqual([
      { page: "p1", visual: "v1", pointer: "/explorationState/sections/p1/visualContainers/v1" },
      {
        page: "p1",
        visual: "gone",
        pointer: "/explorationState/sections/p1/visualContainers/gone",
      },
    ]);
    // Microsoft's bookmark schema declares no annotations, so the reader keeps none.
    expect(b).not.toHaveProperty("annotations");
    expect(report.measures.map((m) => [m.table, m.name, m.hidden, m.line])).toEqual([
      ["Sales", "Net Margin", false, 7],
      ["Sales", "Margin %", false, 8],
    ]);
    // A report measure carries no annotations: pbiplint reads no ignore on one.
    expect(report.measures[0]).not.toHaveProperty("annotations");
  });
});

describe("the schema notice", () => {
  const onVisual = (version: string, id = "v") => ({
    path: `definition/pages/p/visuals/${id}/visual.json`,
    text: visual(id).replace(
      schema("visualContainer", "2.8.0"),
      schema("visualContainer", version),
    ),
  });
  const onBookmark = (version: string, id = "b") => ({
    path: `definition/bookmarks/${id}.bookmark.json`,
    text: j({
      $schema: schema("bookmark", version),
      name: id,
      displayName: id,
      explorationState: {},
    }),
  });

  it("knows the newest version Microsoft publishes of each family the reader reads", () => {
    // github.com/microsoft/json-schemas, 2026-09-23: fabric/item/report/definition/<family>/,
    // then fabric/item/report/definitionProperties/ (definition.pbir) and
    // fabric/gitIntegration/platformProperties/ (the report's .platform).
    expect(KNOWN_SCHEMAS).toEqual({
      report: "3.3.0",
      page: "2.1.0",
      visualContainer: "2.9.0",
      pagesMetadata: "1.1.0",
      bookmarksMetadata: "1.0.0",
      bookmark: "2.1.0",
      reportExtension: "1.0.0",
      visualContainerMobileState: "2.4.0",
      definitionProperties: "2.0.0",
      platformProperties: "2.1.0",
    });
  });
  it("gives the notice for a definition.pbir or a .platform on a newer major, and reads it", () => {
    const pbir = (version: string) => ({
      path: "definition.pbir",
      text: j({
        $schema: `https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/${version}/schema.json`,
        version: "4.0",
        datasetReference: { byPath: { path: "../Demo.SemanticModel" } },
      }),
    });
    const platform = (version: string) => ({
      path: ".platform",
      text: j({
        $schema: `https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/${version}/schema.json`,
        metadata: { type: "Report", displayName: "Demo" },
        config: { version: "2.0", logicalId: "00000000-0000-0000-0000-000000000000" },
      }),
    });
    const newerPbir = buildReport([pbir("3.0.0")]);
    expect(newerPbir.diagnostics).toEqual([
      {
        kind: "schema-newer-than-known",
        path: "definition.pbir",
        message:
          "definition.pbir uses definitionProperties schema 3.0.0, a newer major version than the 2.0.0 this version of pbiplint knows; properties it does not know are ignored",
      },
    ]);
    expect(newerPbir.report.datasetReference).toEqual({
      kind: "byPath",
      path: "../Demo.SemanticModel",
    });
    const newerPlatform = buildReport([platform("3.0.0")]);
    expect(newerPlatform.diagnostics).toEqual([
      {
        kind: "schema-newer-than-known",
        path: ".platform",
        message:
          ".platform uses platformProperties schema 3.0.0, a newer major version than the 2.1.0 this version of pbiplint knows; properties it does not know are ignored",
      },
    ]);
    expect(newerPlatform.report.displayName).toBe("Demo");
    // The known major raises none: Desktop saves definitionProperties 2.0.0 and
    // platformProperties 2.0.0, and a newer minor is read as the family's known shape.
    for (const file of [pbir("2.0.0"), pbir("2.1.0"), platform("2.0.0"), platform("2.2.0")])
      expect(buildReport([file]).diagnostics).toEqual([]);
  });
  it("reads a newer minor version within the known major without a notice", () => {
    // Desktop saves visualContainer 2.10.0 to 2.12.0, which Microsoft has not published.
    expect(buildReport([onVisual("2.12.0")]).diagnostics).toEqual([]);
  });
  it("gives the notice for a newer major version, naming the version and the one it knows", () => {
    expect(buildReport([onVisual("3.0.0")]).diagnostics).toEqual([
      {
        kind: "schema-newer-than-known",
        path: "definition/pages/p/visuals/v/visual.json",
        message:
          "definition/pages/p/visuals/v/visual.json uses visualContainer schema 3.0.0, a newer major version than the 2.9.0 this version of pbiplint knows; properties it does not know are ignored",
      },
    ]);
    expect(buildReport([onBookmark("3.0.0")]).diagnostics.map((d) => d.message)).toEqual([
      "definition/bookmarks/b.bookmark.json uses bookmark schema 3.0.0, a newer major version than the 2.1.0 this version of pbiplint knows; properties it does not know are ignored",
    ]);
  });
  it("gives the notice once per family however many of its files are on a newer major", () => {
    const { diagnostics } = buildReport([
      onVisual("3.0.0", "a"),
      onVisual("3.1.0", "b"),
      onBookmark("3.0.0", "x"),
      onBookmark("4.0.0", "y"),
    ]);
    expect(diagnostics.map((d) => d.path)).toEqual([
      "definition/bookmarks/x.bookmark.json",
      "definition/pages/p/visuals/a/visual.json",
    ]);
  });
  it("reads an older version without a notice", () => {
    expect(buildReport([onVisual("1.2.0"), onBookmark("1.4.0")]).diagnostics).toEqual([]);
  });
  it("reads a file whose schema family is the name of an Object member, with no notice", () => {
    for (const family of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const { report, diagnostics } = buildReport([
        {
          path: "definition/pages/p/visuals/v/visual.json",
          text: visual("v").replace(schema("visualContainer", "2.8.0"), schema(family, "9.0.0")),
        },
      ]);
      expect(diagnostics).toEqual([]);
      expect(report.pages[0]!.visuals.map((v) => v.id)).toEqual(["v"]);
    }
  });
});

describe("buildReport tolerance", () => {
  it("reports a schema newer than it knows once per family and ignores families it does not know", () => {
    const { diagnostics } = buildReport([
      { path: "definition/pages/a/page.json", text: page("a").replace("page/2.1.0", "page/9.0.0") },
      { path: "definition/pages/b/page.json", text: page("b").replace("page/2.1.0", "page/9.1.0") },
      { path: "definition/other.json", text: j({ $schema: "https://x/thing/9.9.9/schema.json" }) },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      kind: "schema-newer-than-known",
      path: "definition/pages/a/page.json",
    });
    expect(diagnostics[0]!.message).toContain(
      `a newer major version than the ${KNOWN_SCHEMAS.page} this version of pbiplint knows`,
    );
  });
  it("keeps a file with a conflict marker as an issue and still builds everything else", () => {
    const { report } = buildReport([
      { path: "definition/pages/a/page.json", text: "<<<<<<< HEAD\n" + page("a") },
      { path: "definition/pages/a/visuals/v/visual.json", text: visual("v") },
    ]);
    expect(report.issues.map((i) => [i.file, i.line])).toEqual([
      ["definition/pages/a/page.json", 1],
    ]);
    // The page file could not be read, so the visual's page is a stub named by its folder.
    expect(report.pages.map((p) => [p.id, p.displayName, p.type])).toEqual([["a", "a", undefined]]);
    expect(report.pages[0]!.visuals.map((v) => v.id)).toEqual(["v"]);
  });
  it("keeps a file whose document is not a JSON object as an issue and reads nothing from it", () => {
    // Every file the PBIR format defines, each of which Microsoft's schema gives an object root.
    const { report } = buildReport([
      { path: "../Demo.pbip", text: "[]" },
      { path: ".platform", text: "[]" },
      { path: "definition.pbir", text: "[]" },
      { path: "definition/version.json", text: "[]" },
      { path: "definition/report.json", text: "[]" },
      { path: "definition/pages/pages.json", text: "\n[]\n" },
      { path: "definition/pages/a/page.json", text: '"Sales overview"' },
      { path: "definition/pages/a/visuals/v/visual.json", text: visual("v") },
      { path: "definition/pages/a/visuals/v/mobile.json", text: "[]" },
      { path: "definition/pages/a/visuals/w/visual.json", text: "null" },
      { path: "definition/reportExtensions.json", text: "[]" },
      { path: "definition/bookmarks/bookmarks.json", text: "[]" },
      { path: "definition/bookmarks/b.bookmark.json", text: "[]" },
    ]);
    const holds = (kind: string) => `not a JSON object (the file holds ${kind})`;
    expect(report.issues.map((i) => [i.file, i.line, i.text, i.reason])).toEqual([
      ["../Demo.pbip", 1, "[]", holds("an array")],
      [".platform", 1, "[]", holds("an array")],
      ["definition.pbir", 1, "[]", holds("an array")],
      ["definition/bookmarks/b.bookmark.json", 1, "[]", holds("an array")],
      ["definition/bookmarks/bookmarks.json", 1, "[]", holds("an array")],
      ["definition/pages/a/page.json", 1, '"Sales overview"', holds("a string")],
      ["definition/pages/a/visuals/v/mobile.json", 1, "[]", holds("an array")],
      ["definition/pages/a/visuals/w/visual.json", 1, "null", holds("null")],
      ["definition/pages/pages.json", 2, "[]", holds("an array")],
      ["definition/report.json", 1, "[]", holds("an array")],
      ["definition/reportExtensions.json", 1, "[]", holds("an array")],
      ["definition/version.json", 1, "[]", holds("an array")],
    ]);
    expect(report.file).toBeUndefined();
    expect(report.pagesHeader).toEqual({ pageOrder: [] });
    expect(report.bookmarksHeader).toEqual({ items: [] });
    expect(report.bookmarks).toEqual([]);
    expect(report.datasetReference).toEqual({ kind: "none" });
    expect(report.extensions).toBe("unread");
    // The definition files among them, which a rule that must see every reference cannot do
    // without; the .pbip, the .platform, and definition.pbir hold no field references.
    expect(report.unreadDefinitionFiles).toEqual([
      "definition/bookmarks/b.bookmark.json",
      "definition/bookmarks/bookmarks.json",
      "definition/pages/a/page.json",
      "definition/pages/a/visuals/v/mobile.json",
      "definition/pages/a/visuals/w/visual.json",
      "definition/pages/pages.json",
      "definition/report.json",
      "definition/reportExtensions.json",
      "definition/version.json",
    ]);
    // The page file was not read, so the visual's page is a stub named by its folder, as it is for
    // invalid JSON; the visual.json that holds null is left out, and the unread mobile.json does
    // not give the other visual a mobile layout.
    expect(report.pages.map((p) => [p.id, p.displayName, p.json])).toEqual([["a", "a", undefined]]);
    expect(report.pages[0]!.visuals.map((v) => [v.id, v.hasMobileLayout])).toEqual([["v", false]]);
  });
  it("reads a JSON file the PBIR format does not define as before, whatever document it holds", () => {
    // Microsoft publishes no schema for a file of the author's own under definition, so an array
    // there is not an issue; invalid JSON and a conflict marker still are, as for any report file.
    const issues = (path: string, text: string) =>
      buildReport([{ path, text }]).report.issues.map((i) => [i.file, i.line, i.reason]);
    // Such a file is not part of the report, so one that cannot be read is not an unread report file.
    const unread = (path: string, text: string) =>
      buildReport([{ path, text }]).report.unreadDefinitionFiles;
    for (const path of [
      "definition/notes/owners.json",
      "definition/pages/a/notes.json",
      "definition/pages/a/visuals/v/extra.json",
      "definition/bookmarks/b.json",
    ]) {
      expect(issues(path, '["alice"]')).toEqual([]);
      expect(issues(path, "null")).toEqual([]);
      expect(issues(path, '["alice",]')).toEqual([
        [path, 1, expect.stringMatching(/^not valid JSON \(/)],
      ]);
      expect(issues(path, '<<<<<<< HEAD\n["alice"]\n=======\n["bob"]\n>>>>>>> main\n')).toEqual([
        [path, 1, "merge conflict marker"],
        [path, 3, "merge conflict marker"],
        [path, 5, "merge conflict marker"],
      ]);
      expect(unread(path, '["alice",]')).toEqual([]);
      expect(unread(path, "<<<<<<< HEAD\n[]\n")).toEqual([]);
    }
  });
  it("lists each definition file the PBIR format defines that could not be read, and no other file", () => {
    const { report } = buildReport([
      { path: "../Demo.pbip", text: "{" },
      { path: ".platform", text: "<<<<<<< HEAD\n{}\n" },
      { path: "definition.pbir", text: "{" },
      { path: "definition/report.json", text: j({ $schema: schema("report", "3.2.0") }) },
      { path: "definition/pages/a/page.json", text: page("a") },
      { path: "definition/pages/a/visuals/v/visual.json", text: '{ "name": "v", ' },
      { path: "definition/pages/a/visuals/w/visual.json", text: visual("w") },
      { path: "definition/notes/owners.json", text: '["alice",]' },
      {
        path: "definition/reportExtensions.json",
        text: '{\n<<<<<<< HEAD\n  "entities": []\n=======\n}\n>>>>>>> theirs\n',
      },
    ]);
    expect(report.unreadDefinitionFiles).toEqual([
      "definition/pages/a/visuals/v/visual.json",
      "definition/reportExtensions.json",
    ]);
    // Every file that could not be read is still a parse issue, whether or not it is listed.
    expect(report.issues.map((i) => i.file)).toEqual([
      "../Demo.pbip",
      ".platform",
      "definition.pbir",
      "definition/notes/owners.json",
      "definition/pages/a/visuals/v/visual.json",
      "definition/reportExtensions.json",
      "definition/reportExtensions.json",
      "definition/reportExtensions.json",
    ]);
    const clean = buildReport([
      { path: "definition/report.json", text: j({}) },
      { path: "definition/pages/a/visuals/w/visual.json", text: visual("w") },
    ]);
    expect(clean.report.unreadDefinitionFiles).toEqual([]);
    // The one test the engine's skip and the Model fact's unknown share.
    expect(fieldFileUnread(report)).toBe(true);
    expect(fieldFileUnread(clean.report)).toBe(false);
    const ownFileOnly = buildReport([
      { path: "definition/report.json", text: j({}) },
      { path: "definition/notes/owners.json", text: '["alice",]' },
    ]);
    expect(fieldFileUnread(ownFileOnly.report)).toBe(false);
  });
  it("marks a page as having a mobile layout by the mobile.json read in its folder, whether or not that visual's visual.json was", () => {
    const { report } = buildReport([
      // a: the visual's visual.json is invalid, its mobile.json was read.
      { path: "definition/pages/a/page.json", text: page("a") },
      { path: "definition/pages/a/visuals/v/visual.json", text: '{ "name": "v", ' },
      { path: "definition/pages/a/visuals/v/mobile.json", text: j({}) },
      // b: a stub page, its page.json unread, one visual read with a mobile.json.
      { path: "definition/pages/b/page.json", text: "{" },
      { path: "definition/pages/b/visuals/w/visual.json", text: visual("w") },
      { path: "definition/pages/b/visuals/w/mobile.json", text: j({}) },
      // c: a visual with no mobile.json, and one whose mobile.json could not be read.
      { path: "definition/pages/c/page.json", text: page("c") },
      { path: "definition/pages/c/visuals/x/visual.json", text: visual("x") },
      { path: "definition/pages/c/visuals/y/visual.json", text: visual("y") },
      { path: "definition/pages/c/visuals/y/mobile.json", text: "[]" },
    ]);
    expect(report.pages.map((p) => [p.id, p.hasMobileLayout])).toEqual([
      ["a", true],
      ["b", true],
      ["c", false],
    ]);
    expect(buildReport(files).report.pages.map((p) => [p.id, p.hasMobileLayout])).toEqual([
      ["p2", false],
      ["p1", true],
    ]);
  });
  it("records the pages, visuals, and bookmarks whose own file could not be read, by the folder or file name Desktop gives them", () => {
    const { report } = buildReport([
      // pages.json, a mobile.json, and bookmarks.json name no page, visual, or bookmark of their own.
      { path: "definition/pages/pages.json", text: "{" },
      { path: "definition/pages/a/page.json", text: page("a") },
      { path: "definition/pages/a/visuals/v/visual.json", text: visual("v") },
      { path: "definition/pages/a/visuals/v/mobile.json", text: "[]" },
      { path: "definition/pages/a/visuals/w/visual.json", text: "<<<<<<< HEAD\n{}\n" },
      // A page whose page.json could not be read and one of whose visuals was: its stub page keeps
      // the visual that could not be read as well.
      { path: "definition/pages/s/page.json", text: "{" },
      { path: "definition/pages/s/visuals/x/visual.json", text: visual("x") },
      { path: "definition/pages/s/visuals/y/visual.json", text: "[]" },
      // A page none of whose files could be read has no page object to hold its visual.
      { path: "definition/pages/u/page.json", text: "{" },
      { path: "definition/pages/u/visuals/z/visual.json", text: "{" },
      // A page renamed by hand keeps its folder, where its visuals sit.
      { path: "definition/pages/646039348818b651e02c/page.json", text: page("page_dashboard") },
      { path: "definition/pages/646039348818b651e02c/visuals/r/visual.json", text: "{" },
      { path: "definition/bookmarks/bookmarks.json", text: "{" },
      { path: "definition/bookmarks/b1.bookmark.json", text: "[]" },
      { path: "definition/bookmarks/b2.bookmark.json", text: j({ name: "b2" }) },
    ]);
    expect(report.unreadPages).toEqual(["s", "u"]);
    expect(report.unreadBookmarks).toEqual(["b1"]);
    expect(report.pages.map((p) => [p.id, p.unreadVisuals])).toEqual([
      ["page_dashboard", ["r"]],
      ["a", ["w"]],
      ["s", ["y"]],
    ]);
    expect(visualFileUnread(report)).toBe(true);
    // A page.json or a mobile.json that could not be read is not a visual that could not be.
    const noVisual = buildReport([
      { path: "definition/pages/a/page.json", text: "{" },
      { path: "definition/pages/a/visuals/v/visual.json", text: visual("v") },
      { path: "definition/pages/a/visuals/v/mobile.json", text: "{" },
    ]).report;
    expect(visualFileUnread(noVisual)).toBe(false);
    expect(noVisual.pages.map((p) => [p.id, p.unreadVisuals])).toEqual([["a", []]]);
    // Every file read: nothing recorded.
    const clean = buildReport(files).report;
    expect([clean.unreadPages, clean.unreadBookmarks]).toEqual([[], []]);
    expect(clean.pages.flatMap((p) => p.unreadVisuals)).toEqual([]);
  });
  it("tells a definition file the report's field references are read from from one that holds none", () => {
    // The files report-refs.ts reads references from: the report's filters, its measures' DAX, a
    // page's filters and binding, a visual, and a bookmark's captured state.
    for (const path of [
      "definition/report.json",
      "definition/reportExtensions.json",
      "definition/pages/a/page.json",
      "definition/pages/a/visuals/v/visual.json",
      "definition/bookmarks/b.bookmark.json",
    ])
      expect(holdsFieldReferences(path), path).toBe(true);
    // The rest of the definition folder names no field, nor does a file the format does not define.
    for (const path of [
      "definition/version.json",
      "definition/pages/pages.json",
      "definition/bookmarks/bookmarks.json",
      "definition/pages/a/visuals/v/mobile.json",
      "definition/notes/owners.json",
      "definition.pbir",
      ".platform",
    ])
      expect(holdsFieldReferences(path), path).toBe(false);
    // Each of those four unread alone leaves every field reference read; any of the five does not.
    const unreadAlone = (path: string) =>
      fieldFileUnread(
        buildReport([
          { path: "definition/report.json", text: j({}) },
          { path: "definition/pages/a/page.json", text: page("a") },
          { path: "definition/pages/a/visuals/v/visual.json", text: visual("v") },
          { path, text: "<<<<<<< HEAD\n{}\n" },
        ]).report,
      );
    for (const path of [
      "definition/version.json",
      "definition/pages/pages.json",
      "definition/bookmarks/bookmarks.json",
      "definition/pages/a/visuals/v/mobile.json",
    ])
      expect(unreadAlone(path), path).toBe(false);
    for (const path of [
      "definition/report.json",
      "definition/reportExtensions.json",
      "definition/pages/a/page.json",
      "definition/pages/a/visuals/v/visual.json",
      "definition/bookmarks/b.bookmark.json",
    ])
      expect(unreadAlone(path), path).toBe(true);
  });
  it("records whether reportExtensions.json was in the input and could be read", () => {
    const extensions = (...texts: string[]) =>
      buildReport(texts.map((text) => ({ path: "definition/reportExtensions.json", text }))).report
        .extensions;
    const side = (expression: string) =>
      j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression }] }] });
    expect(extensions()).toBe("absent");
    expect(extensions(j({ name: "extension", entities: [] }))).toBe("read");
    expect(
      extensions(["<<<<<<< HEAD", side("1"), "=======", side("2"), ">>>>>>> main"].join("\n")),
    ).toBe("unread");
    expect(extensions('{ "entities": [ }')).toBe("unread");
    expect(extensions("[]")).toBe("unread");
  });
  it("ignores a .platform of another part and a definition.pbir with a connection", () => {
    const { report } = buildReport([
      { path: ".platform", text: j({ metadata: { type: "SemanticModel", displayName: "Model" } }) },
      {
        path: "definition.pbir",
        text: j({ datasetReference: { byConnection: { connectionString: "x" } } }),
      },
    ]);
    expect(report.displayName).toBeUndefined();
    expect(report.datasetReference).toEqual({ kind: "byConnection" });
  });
  it("reads literals with and without quotes", () => {
    expect(literal(lit("'It''s'"))).toBe("It's");
    expect(literal(lit("true"))).toBe("true");
    expect(literal(lit("18D"))).toBe("18D");
    expect(literal({ expr: { Measure: {} } })).toBeUndefined();
    expect(literal(undefined)).toBeUndefined();
  });
});
