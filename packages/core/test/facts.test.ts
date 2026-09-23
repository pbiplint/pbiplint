import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { buildReport } from "../src/pbir/build.js";
import { buildFacts } from "../src/project/facts.js";
import { defaultRules } from "../src/rules/index.js";
import { modelFrom } from "./helpers.js";

const j = (v: unknown) => JSON.stringify(v);
const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const lit = (value: string) => ({ expr: { Literal: { Value: value } } });
const page = (name: string, displayName: string, extra: Record<string, unknown> = {}) => ({
  path: `definition/pages/${name}/page.json`,
  text: j({
    $schema: "https://x/page/2.1.0/schema.json",
    name,
    displayName,
    width: 1280,
    height: 720,
    ...extra,
  }),
});
const visual = (
  pageId: string,
  name: string,
  type: string,
  extra: Record<string, unknown> = {},
  fields: unknown[] = [],
) => ({
  path: `definition/pages/${pageId}/visuals/${name}/visual.json`,
  text: j({
    $schema: "https://x/visualContainer/2.8.0/schema.json",
    name,
    position: {},
    ...extra,
    visual: {
      visualType: type,
      query: { queryState: { Values: { projections: fields.map((field) => ({ field })) } } },
    },
  }),
});
const ALL = new Set(defaultRules.map((r) => r.id));
const model = modelFrom(
  "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tcolumn Region\n\t\tdataType: string\n\tmeasure Total = SUM('Sales'[Amount])\n\tmeasure Other = 1\n",
);

const files = [
  {
    path: "definition/report.json",
    text: j({
      $schema: "https://x/report/3.2.0/schema.json",
      objects: { outspacePane: [{ properties: { expanded: lit("true") } }] },
      publicCustomVisuals: ["ChicletSlicer1448559807354", "Used123"],
    }),
  },
  {
    path: "definition/pages/pages.json",
    text: j({ pageOrder: ["p1", "p2", "p3"], activePageName: "p1" }),
  },
  page("p1", "Overview"),
  page("p2", "Tips", { pageBinding: { type: "Tooltip" } }),
  page("p3", "Scratch", { visibility: "HiddenInViewMode" }),
  visual(
    "p1",
    "v1",
    "slicer",
    {
      filterConfig: {
        filters: [
          {
            name: "f",
            field: column("Sales", "Region"),
            type: "Categorical",
            filter: { Where: [] },
          },
        ],
      },
    },
    [column("Sales", "Region")],
  ),
  visual("p1", "v2", "slicer", {}, [column("Sales", "Region")]),
  visual("p1", "v3", "cardVisual", { isHidden: true }, [
    { Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Total" } },
  ]),
  visual("p1", "v4", "Used123"),
  { path: "definition/pages/p1/visuals/v4/mobile.json", text: j({ position: {} }) },
  {
    path: "definition/reportExtensions.json",
    text: j({
      entities: [
        {
          name: "Sales",
          measures: [
            { name: "M1", expression: "1" },
            { name: "M2", expression: "2" },
          ],
        },
      ],
    }),
  },
];

describe("buildFacts", () => {
  it("states what the report will do, with a rule id where a known rule checks the fact", () => {
    const { report } = buildReport(files);
    const project = { model, report };
    expect(buildFacts(project, buildIndexes(project), ALL)).toEqual([
      {
        layer: "report",
        label: "Opens on",
        value: "Overview",
        detail: "the page open when it was saved; no landing page set",
        ruleId: "LANDING_PAGE_NOT_SET",
      },
      { layer: "report", label: "Filters pane", value: "open", ruleId: "FILTERS_PANE_STATE" },
      {
        layer: "report",
        label: "Pages",
        value: "3",
        detail: "1 hidden, 1 tooltip",
        ruleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
      },
      {
        layer: "report",
        label: "Visuals",
        value: "4",
        detail: "1 hidden; 2 custom visual types registered, 1 used",
        ruleId: "HIDDEN_VISUAL_WITH_FIELDS",
      },
      {
        layer: "report",
        label: "Report measures",
        value: "2",
        detail: "defined in the report, not the model",
      },
      {
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "1 with a saved selection",
      },
      { layer: "report", label: "Mobile layouts", value: "1 of 3 pages" },
      {
        layer: "report",
        label: "Schema versions",
        value: "report 3.2.0, page 2.1.0, visual 2.8.0",
      },
      {
        layer: "model",
        label: "Model",
        value: "1 table, 2 columns, 2 measures",
        detail: "0 columns and 1 measure not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      },
    ]);
  });
  it("names a landing page, a hidden or missing opening page, a closed or hidden pane, and drops rule ids the run lacks", () => {
    const { report } = buildReport([
      {
        path: "definition/report.json",
        text: j({ objects: { outspacePane: [{ properties: { visible: lit("false") } }] } }),
      },
      {
        path: "definition/pages/pages.json",
        text: j({ pageOrder: ["p3"], activePageName: "p3", landingPageName: "gone" }),
      },
      page("p3", "Scratch", { visibility: "HiddenInViewMode" }),
    ]);
    const facts = buildFacts({ report }, buildIndexes({ report }), new Set());
    expect(facts[0]).toEqual({
      layer: "report",
      label: "Opens on",
      value: '"gone" (no such page)',
      detail: "landing page",
    });
    expect(facts[1]).toEqual({
      layer: "report",
      label: "Filters pane",
      value: "hidden from readers",
    });
    expect(facts.find((f) => f.label === "Model")).toBeUndefined();
    const closed = buildReport([
      {
        path: "definition/report.json",
        text: j({ objects: { outspacePane: [{ properties: { expanded: lit("false") } }] } }),
      },
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p3"], activePageName: "p3" }) },
      page("p3", "Scratch", { visibility: "HiddenInViewMode" }),
    ]).report;
    const f2 = buildFacts({ report: closed }, buildIndexes({ report: closed }), ALL);
    expect(f2[0]).toEqual({
      layer: "report",
      label: "Opens on",
      value: "Scratch (hidden)",
      detail: "the page open when it was saved; no landing page set",
      ruleId: "OPENING_PAGE_INVALID",
    });
    expect(f2[1]).toEqual({
      layer: "report",
      label: "Filters pane",
      value: "closed",
      ruleId: "FILTERS_PANE_STATE",
    });
    expect(f2.find((f) => f.label === "Slicers")).toEqual({
      layer: "report",
      label: "Slicers",
      value: "none",
    });
    expect(f2.find((f) => f.label === "Mobile layouts")).toEqual({
      layer: "report",
      label: "Mobile layouts",
      value: "none",
    });
  });
  it("reads an unrecorded pane as open, no named page as the first page, and a hidden landing page as fine", () => {
    const unrecorded = buildReport([
      { path: "definition/report.json", text: j({}) },
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p2", "p1"] }) },
      page("p1", "Overview"),
      page("p2", "Summary"),
    ]).report;
    const f = buildFacts({ report: unrecorded }, buildIndexes({ report: unrecorded }), ALL);
    expect(f[0]).toEqual({
      layer: "report",
      label: "Opens on",
      value: "Summary",
      detail: "the first page; no landing page set",
      ruleId: "LANDING_PAGE_NOT_SET",
    });
    expect(f[1]).toEqual({
      layer: "report",
      label: "Filters pane",
      value: "open",
      detail: "read as open; report.json does not record it",
      ruleId: "FILTERS_PANE_STATE",
    });
    // With no report.json read, absent or unreadable, nothing says what state the pane is in.
    const pagesOnly = [
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p1"], activePageName: "p1" }) },
      page("p1", "Overview"),
    ];
    const conflicted = [
      "{",
      "<<<<<<< HEAD",
      '  "objects": {}',
      "=======",
      "}",
      ">>>>>>> theirs",
    ].join("\n");
    for (const files of [
      pagesOnly,
      [...pagesOnly, { path: "definition/report.json", text: conflicted }],
    ]) {
      const unread = buildReport(files).report;
      expect(
        buildFacts({ report: unread }, buildIndexes({ report: unread }), ALL).find(
          (fact) => fact.label === "Filters pane",
        ),
      ).toEqual({
        layer: "report",
        label: "Filters pane",
        value: "unknown",
        detail: "report.json was not read",
      });
    }
    // A hidden landing page is a true fact, but not one OPENING_PAGE_INVALID flags.
    const hiddenLanding = buildReport([
      {
        path: "definition/pages/pages.json",
        text: j({ pageOrder: ["p3"], activePageName: "p3", landingPageName: "p3" }),
      },
      page("p3", "Scratch", { visibility: "HiddenInViewMode" }),
    ]).report;
    expect(
      buildFacts({ report: hiddenLanding }, buildIndexes({ report: hiddenLanding }), ALL)[0],
    ).toEqual({
      layer: "report",
      label: "Opens on",
      value: "Scratch (hidden)",
      detail: "landing page",
    });
    // With no pages there is nothing to open, so LANDING_PAGE_NOT_SET does not fire and the fact links no rule.
    const empty = buildReport([
      { path: "definition/report.json", text: j({}) },
      { path: "definition/pages/pages.json", text: j({ pageOrder: [] }) },
    ]).report;
    expect(buildFacts({ report: empty }, buildIndexes({ report: empty }), ALL)[0]).toEqual({
      layer: "report",
      label: "Opens on",
      value: "unknown",
      detail: "no landing page set",
    });
  });
  it("says unknown when pages.json was not read, whether it is absent or unreadable", () => {
    const unknown = {
      layer: "report",
      label: "Opens on",
      value: "unknown",
      detail: "pages.json was not read",
    };
    const absent = buildReport([
      { path: "definition/report.json", text: j({}) },
      page("a", "Alpha"),
      page("b", "Beta"),
    ]).report;
    expect(buildFacts({ report: absent }, buildIndexes({ report: absent }), ALL)[0]).toEqual(
      unknown,
    );
    const conflicted = buildReport([
      { path: "definition/report.json", text: j({}) },
      {
        path: "definition/pages/pages.json",
        text: '{\n  "pageOrder": ["b", "a"],\n<<<<<<< HEAD\n  "activePageName": "b"\n=======\n  "activePageName": "a"\n>>>>>>> theirs\n}',
      },
      page("a", "Alpha"),
      page("b", "Beta"),
    ]).report;
    expect(conflicted.issues.length).toBeGreaterThan(0);
    expect(
      buildFacts({ report: conflicted }, buildIndexes({ report: conflicted }), ALL)[0],
    ).toEqual(unknown);
  });
  it("links a fact to the first of its candidate rules the run knows", () => {
    const { report } = buildReport(files);
    const project = { model, report };
    const facts = buildFacts(
      project,
      buildIndexes(project),
      new Set(["LANDING_PAGE_NOT_SET", "REMOVE_UNUSED_CUSTOM_VISUALS"]),
    );
    expect(facts.find((f) => f.label === "Opens on")!.ruleId).toBe("LANDING_PAGE_NOT_SET");
    expect(facts.find((f) => f.label === "Visuals")!.ruleId).toBe("REMOVE_UNUSED_CUSTOM_VISUALS");
  });
  it("links the Visuals fact to HIDDEN_VISUAL_WITH_FIELDS by the rule's own count of fields in wells", () => {
    // A visual calculation references no model field, and is still a field in a well.
    const calc = { NativeVisualCalculation: { Language: "dax", Expression: "1", Name: "One" } };
    const { report } = buildReport([
      page("p1", "Overview"),
      visual("p1", "v1", "tableEx", { isHidden: true }, [calc]),
    ]);
    expect(report.pages[0]!.visuals[0]!.fields).toEqual([]);
    const facts = buildFacts({ report }, buildIndexes({ report }), ALL);
    expect(facts.find((f) => f.label === "Visuals")).toEqual({
      layer: "report",
      label: "Visuals",
      value: "1",
      detail: "1 hidden",
      ruleId: "HIDDEN_VISUAL_WITH_FIELDS",
    });
  });
  it("gives a model-only run no facts at all, because the block is about the report", () => {
    expect(buildFacts({ model }, buildIndexes({ model }), ALL)).toEqual([]);
  });
});
