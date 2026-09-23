import { describe, expect, it } from "vitest";
import { REPORT_LEVEL_MEASURES } from "../src/rules/pbiplint/measures.js";
import { DEFAULT_PAGE_NAME } from "../src/rules/pbiplint/pages.js";
import { VISUAL_OUTSIDE_PAGE, VISUAL_WITHOUT_FIELDS } from "../src/rules/pbiplint/visuals.js";
import {
  bound,
  column,
  j,
  lineOf,
  measure,
  page,
  pretty,
  projectFrom,
  reportFindings,
  reportObjectIds,
  visual,
} from "./report-helpers.js";

/** What every tier-2 rule shares: a warning on the report layer, built into pbiplint. */
const tier2 = { severity: 2, layer: "report", needs: ["report"], status: "builtin" };

describe("DEFAULT_PAGE_NAME", () => {
  it("fires on Page <n>, Duplicate of <name>, and <name> (copy)", () => {
    const files = [
      page("a", { displayName: "Page 2" }),
      page("b", { displayName: "Duplicate of Overview" }),
      page("c", { displayName: "Overview (copy)" }),
      page("d", { displayName: "Page 2 sales" }),
      page("e", { displayName: "Overview" }),
      page("f", { displayName: "Duplicate of Duplicate of Overview" }),
    ];
    expect(reportObjectIds(DEFAULT_PAGE_NAME, files)).toEqual(["a", "b", "c", "f"]);
  });
  it("matches only the page numbers Desktop gives, from 1 without leading zeros", () => {
    const files = [
      page("a", { displayName: "Page 1" }),
      page("b", { displayName: "Page 10" }),
      page("c", { displayName: "Page 01" }),
      page("d", { displayName: "Page 0" }),
    ];
    expect(reportObjectIds(DEFAULT_PAGE_NAME, files)).toEqual(["a", "b"]);
  });
  it("says which name it matched, never who gave it", () => {
    const files = [
      page("a", { displayName: "Page 2" }),
      page("b", { displayName: "Duplicate of Overview" }),
      page("c", { displayName: "Overview (copy)" }),
    ];
    expect(reportFindings(DEFAULT_PAGE_NAME, files).map((f) => f.detail)).toEqual([
      '"Page 2" is the name Power BI Desktop gives a new page',
      '"Duplicate of Overview" is the name Power BI Desktop gives a duplicated page',
      '"Overview (copy)" is named as a copy',
    ]);
  });
  it("reads only a display name page.json records, not the folder id it falls back to", () => {
    const files = [
      // A stub page: its visual is there, its page.json is not.
      visual("Page 3", "v", "cardVisual"),
      // A page.json that records no displayName.
      page("Page 4", { displayName: undefined }),
    ];
    const { report } = projectFrom(files);
    expect(report!.pages.map((p) => p.displayName)).toEqual(["Page 3", "Page 4"]);
    expect(reportObjectIds(DEFAULT_PAGE_NAME, files)).toEqual([]);
  });
  it("sits on the displayName line of the page's page.json", () => {
    const text = pretty({ name: "a", height: 720, width: 1280, displayName: "Page 1" });
    const line = lineOf(text, '"displayName"');
    expect(line).toBeGreaterThan(1);
    const [f] = reportFindings(DEFAULT_PAGE_NAME, [{ path: "definition/pages/a/page.json", text }]);
    expect(f).toMatchObject({
      objectType: "Page",
      objectId: "a",
      location: { file: "definition/pages/a/page.json", line },
    });
    expect(f).toHaveProperty("object");
    expect(DEFAULT_PAGE_NAME).toMatchObject({
      ...tier2,
      name: "Page keeps its default name",
      category: "Report Design",
      scope: ["Page"],
    });
  });
});

describe("VISUAL_WITHOUT_FIELDS", () => {
  /** Types that bind no fields by design, every one quiet with its wells empty. */
  const NON_DATA = [
    "shape",
    "basicShape",
    "textbox",
    "image",
    "actionButton",
    "pageNavigator",
    "bookmarkNavigator",
    "qnaVisual",
    "aiNarratives",
    "scorecard",
    "animatedNumber",
    "rdlVisual",
    "FlowVisual_C29F1DCC_81F5_4973_94AD_0517D44CC06A",
  ];

  it("fires on a data visual with nothing bound, never on decoration, navigation, or a group", () => {
    const files = [
      page("p"),
      visual("p", "emptyCard", "cardVisual"),
      visual("p", "emptyTable", "tableEx", {}, { query: { queryState: {} } }),
      bound("p", "card", "cardVisual", [column("Sales", "Amount")]),
      ...NON_DATA.map((t) => visual("p", `nd-${t}`, t)),
      {
        path: "definition/pages/p/visuals/g/visual.json",
        text: j({ name: "g", position: {}, visualGroup: { displayName: "G" } }),
      },
    ];
    expect(reportObjectIds(VISUAL_WITHOUT_FIELDS, files)).toEqual(["emptyCard", "emptyTable"]);
  });
  it("counts the entries in the wells, so a title bound to a measure is not a field bound", () => {
    const files = [
      page("p"),
      // Empty wells and a title bound to a measure: nothing in the wells, so still empty.
      visual(
        "p",
        "titled",
        "barChart",
        {},
        {
          query: { queryState: { Category: { projections: [] } } },
          visualContainerObjects: {
            title: [{ properties: { text: { expr: measure("Sales", "Title") } } }],
          },
        },
      ),
      // A visual calculation is an entry in a well that references no model field.
      visual(
        "p",
        "calc",
        "tableEx",
        {},
        {
          query: {
            queryState: {
              Values: {
                projections: [
                  {
                    field: {
                      NativeVisualCalculation: {
                        Language: "dax",
                        Expression: "1",
                        Name: "One",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ),
    ];
    const visuals = projectFrom(files).report!.pages[0]!.visuals;
    expect(
      visuals.map((v) => [v.id, v.projectionCount, v.fields.length, v.propertyRefs.length]),
    ).toEqual([
      ["calc", 1, 0, 0],
      ["titled", 0, 0, 1],
    ]);
    expect(reportObjectIds(VISUAL_WITHOUT_FIELDS, files)).toEqual(["titled"]);
  });
  it("takes a custom visual for a data visual", () => {
    const files = [page("p"), visual("p", "custom", "BarChartF5983CEA542C47889C9DE852B430DE5F")];
    expect(reportObjectIds(VISUAL_WITHOUT_FIELDS, files)).toEqual(["custom"]);
  });
  it("leaves a container with neither a visual nor a group alone", () => {
    const files = [
      page("p"),
      {
        path: "definition/pages/p/visuals/bare/visual.json",
        text: j({ name: "bare", position: {} }),
      },
    ];
    expect(projectFrom(files).report!.pages[0]!.visuals[0]!.type).toBe("unknown");
    expect(reportObjectIds(VISUAL_WITHOUT_FIELDS, files)).toEqual([]);
  });
  it("leaves a visual that records no visualType alone", () => {
    const files = [
      page("p"),
      {
        path: "definition/pages/p/visuals/typeless/visual.json",
        text: j({ name: "typeless", position: {}, visual: {} }),
      },
    ];
    expect(projectFrom(files).report!.pages[0]!.visuals[0]!.type).toBe("unknown");
    expect(reportObjectIds(VISUAL_WITHOUT_FIELDS, files)).toEqual([]);
  });
  it("sits on the visualType line of the visual's visual.json", () => {
    const file = visual("p", "empty", "cardVisual");
    const text = pretty(JSON.parse(file.text));
    const line = lineOf(text, '"visualType"');
    expect(line).toBeGreaterThan(1);
    expect(reportFindings(VISUAL_WITHOUT_FIELDS, [page("p"), { ...file, text }])).toEqual([
      expect.objectContaining({
        objectType: "Visual",
        objectId: "empty",
        location: { file: "definition/pages/p/visuals/empty/visual.json", line },
        detail: "no fields bound",
      }),
    ]);
    expect(VISUAL_WITHOUT_FIELDS).toMatchObject({
      ...tier2,
      name: "Data visual with no fields",
      category: "Report Design",
      scope: ["Visual"],
    });
  });
});

describe("VISUAL_OUTSIDE_PAGE", () => {
  const at = (
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    container: Record<string, unknown> = {},
  ) =>
    visual("p", name, "cardVisual", {
      position: { x, y, z: 0, width: w, height: h, tabOrder: 0 },
      ...container,
    });

  it("fires when a visual's box passes the page's right or bottom edge", () => {
    const files = [
      page("p", { width: 1280, height: 720 }),
      at("right", 1200, 0, 100, 50),
      at("bottom", 0, 700, 100, 50),
      at("inside", 0, 0, 1280, 720),
    ];
    expect(reportObjectIds(VISUAL_OUTSIDE_PAGE, files)).toEqual(["bottom", "right"]);
    // A page whose file carries no width or height is not checked, whatever a visual's position.
    const noSize = [
      page("q", { width: undefined, height: undefined }),
      visual("q", "noPageSize", "cardVisual", {
        position: { x: 5000, y: 0, z: 0, width: 10, height: 10, tabOrder: 0 },
      }),
    ];
    expect(reportObjectIds(VISUAL_OUTSIDE_PAGE, noSize)).toEqual([]);
  });
  it("reports an edge passed by at least 1 px, each overhang in whole pixels", () => {
    const files = [
      page("p"),
      at("a-right", 1200, 0, 100, 50),
      at("b-under", 0, 620.8, 100, 100),
      at("c-one", 0, 621, 100, 100),
      at("d-both", 1250, 700, 100, 50),
      at("e-hidden", 1200, 0, 100, 50, { isHidden: true }),
    ];
    expect(reportFindings(VISUAL_OUTSIDE_PAGE, files).map((f) => [f.objectId, f.detail])).toEqual([
      ["a-right", "20 px past the right edge"],
      ["c-one", "1 px past the bottom edge"],
      ["d-both", "70 px past the right edge, 30 px past the bottom edge"],
      ["e-hidden", "20 px past the right edge"],
    ]);
  });
  it("checks top-level groups and ungrouped visuals, whose positions are the page's", () => {
    const group = (name: string, x: number, width: number) => ({
      path: `definition/pages/p/visuals/${name}/visual.json`,
      text: j({
        name,
        position: { x, y: 0, z: 0, width, height: 100 },
        visualGroup: { displayName: name, groupMode: "ScaleMode" },
      }),
    });
    const files = [
      page("p"),
      // A group past the right edge is one finding, on the group, not on its child.
      group("outGroup", 1200, 200),
      at("outChild", 0, 0, 200, 100, { parentGroupName: "outGroup" }),
      // A child's x is relative to its group, so its own x plus width says nothing of the page.
      group("inGroup", 0, 400),
      at("inChild", 1200, 0, 200, 100, { parentGroupName: "inGroup" }),
    ];
    expect(reportFindings(VISUAL_OUTSIDE_PAGE, files).map((f) => [f.objectId, f.detail])).toEqual([
      ["outGroup", "120 px past the right edge"],
    ]);
  });
  it("sits on the position line of the visual's visual.json", () => {
    const file = at("right", 1200, 0, 100, 50);
    const text = pretty(JSON.parse(file.text));
    const line = lineOf(text, '"position"');
    expect(line).toBeGreaterThan(1);
    const [f] = reportFindings(VISUAL_OUTSIDE_PAGE, [page("p"), { ...file, text }]);
    expect(f).toMatchObject({
      objectType: "Visual",
      objectId: "right",
      location: { file: "definition/pages/p/visuals/right/visual.json", line },
    });
    expect(VISUAL_OUTSIDE_PAGE).toMatchObject({
      ...tier2,
      name: "Visual extends past the page",
      category: "Report Design",
      scope: ["Visual"],
    });
  });
});

describe("REPORT_LEVEL_MEASURES", () => {
  const extensions = (text: string) => [{ path: "definition/reportExtensions.json", text }];
  const entities = {
    entities: [
      {
        name: "Sales",
        measures: [
          { name: "Net Margin", expression: "1" },
          { name: "Margin %", expression: "2" },
        ],
      },
    ],
  };

  /** The model the report reads, in the run beside it. */
  const model = "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n";

  it("fires once per measure in reportExtensions.json when the run holds the model", () => {
    expect(reportObjectIds(REPORT_LEVEL_MEASURES, extensions(j(entities)), model)).toEqual([
      "Sales.Net Margin",
      "Sales.Margin %",
    ]);
  });
  it("leaves a report that reads a published model alone", () => {
    expect(reportObjectIds(REPORT_LEVEL_MEASURES, extensions(j(entities)))).toEqual([]);
  });
  it("names the table the measure is defined on, at the measure's line", () => {
    const text = pretty(entities);
    const line = lineOf(text, '"Margin %"') - 1;
    expect(line).toBeGreaterThan(1);
    const [, second] = reportFindings(REPORT_LEVEL_MEASURES, extensions(text), model);
    expect(second).toEqual({
      objectType: "ReportMeasure",
      objectName: "[Margin %] (report)",
      objectId: "Sales.Margin %",
      location: { file: "definition/reportExtensions.json", line },
      detail: 'defined in the report on table "Sales"',
    });
    // A report rule that needs the model too: without it, the run skips the rule.
    expect(REPORT_LEVEL_MEASURES).toMatchObject({
      ...tier2,
      name: "Measure defined in the report",
      category: "Maintenance",
      scope: ["ReportMeasure"],
      needs: ["model", "report"],
    });
  });
});
