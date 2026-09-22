import { describe, expect, it } from "vitest";
import { buildReport, KNOWN_SCHEMAS, literal } from "../src/pbir/build.js";

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
    text: j({ items: [{ name: "b1", children: [{ name: "b2" }] }] }),
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
  it("orders pages by pageOrder and reads their header, binding, filters, and annotations", () => {
    expect(report.pagesHeader).toEqual({
      file: "definition/pages/pages.json",
      pageOrder: ["p2", "p1"],
      activePageName: "p1",
      landingPageName: "p2",
    });
    expect(report.pages.map((p) => p.id)).toEqual(["p2", "p1"]);
    const p1 = report.pages[1]!;
    expect(p1.displayName).toBe("Page p1");
    expect(p1.visibility).toBe("HiddenInViewMode");
    expect(p1.bindingType).toBe("Tooltip");
    expect(p1.bindingRefs.map((r) => r.name)).toEqual(["Category"]);
    expect(p1.filters.map((f) => [f.type, f.applied])).toEqual([["Advanced", true]]);
    expect(p1.annotations).toEqual({ "pbiplint.ignore": "X" });
    expect(p1.file).toBe("definition/pages/p1/page.json");
    expect(report.schemaVersions).toEqual({ report: "3.2.0", page: "2.1.0", visual: "2.8.0" });
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
        target: "p2",
        pointer: "/visual/visualContainerObjects/visualLink/0/properties",
      },
    ]);
    expect(v1.filters.map((f) => f.name)).toEqual(["vf"]);
    expect(v1.hasMobileLayout).toBe(true);
    expect(v1.file).toBe("definition/pages/p1/visuals/v1/visual.json");
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
  it("reads bookmarks and their header, and report-level measures with their lines", () => {
    expect(report.bookmarksHeader.items).toEqual([{ name: "b1", children: ["b2"] }]);
    const b = report.bookmarks[0]!;
    expect([b.id, b.displayName, b.activePage, b.pages]).toEqual(["b1", "Reset", "p1", ["p1"]]);
    expect(b.visuals).toEqual([
      { page: "p1", visual: "v1" },
      { page: "p1", visual: "gone" },
    ]);
    expect(report.measures.map((m) => [m.table, m.name, m.hidden, m.line])).toEqual([
      ["Sales", "Net Margin", false, 7],
      ["Sales", "Margin %", false, 8],
    ]);
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
      `newer than the ${KNOWN_SCHEMAS.page} this version of pbiplint knows`,
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
    expect(report.pages.map((p) => [p.id, p.displayName])).toEqual([["a", "a"]]);
    expect(report.pages[0]!.visuals.map((v) => v.id)).toEqual(["v"]);
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
