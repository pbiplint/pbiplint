import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { buildReport } from "../src/pbir/build.js";
import { buildFacts } from "../src/project/facts.js";
import { defaultRules } from "../src/rules/index.js";
import type { RuleOptions } from "../src/rules/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
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
  inner: Record<string, unknown> = {},
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
      ...inner,
    },
  }),
});
const ALL = new Set(defaultRules.map((r) => r.id));
/** FILTERS_PANE_STATE's options under an `expect` policy, as lint passes a rule's options. */
const policy = (expect: "open" | "closed") => new Map([["FILTERS_PANE_STATE", { expect }]]);
const sales =
  "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tcolumn Region\n\t\tdataType: string\n\tmeasure Total = SUM('Sales'[Amount])\n\tmeasure Other = 1\n";
const model = modelFrom(sales);

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
  // A slicer saves its selection in its general filter; its filterConfig entry is a Filters pane
  // filter with nothing applied.
  visual(
    "p1",
    "v1",
    "slicer",
    {
      filterConfig: {
        filters: [{ name: "f", field: column("Sales", "Region"), type: "Categorical" }],
      },
    },
    [column("Sales", "Region")],
    {
      objects: {
        general: [
          {
            properties: {
              filter: {
                filter: {
                  Version: 2,
                  From: [{ Name: "s", Entity: "Sales", Type: 0 }],
                  Where: [
                    {
                      Condition: {
                        In: {
                          Expressions: [
                            {
                              Column: {
                                Expression: { SourceRef: { Source: "s" } },
                                Property: "Region",
                              },
                            },
                          ],
                          Values: [[{ Literal: { Value: "'West'" } }]],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ),
  visual("p1", "v2", "advancedSlicerVisual", {}, [column("Sales", "Region")]),
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
    // The pane is saved open under a policy that expects it closed, so the Filters pane links too.
    expect(buildFacts(project, buildIndexes(project), ALL, policy("closed"))).toEqual([
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
        ruleId: "REPORT_LEVEL_MEASURES",
      },
      {
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "1 saved selection",
        ruleId: "SLICER_SELECTION_SAVED",
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
  it("shows the report measures either way, and links the rule only with the model in the run", () => {
    const { report } = buildReport(files);
    const measures = (project: { model?: typeof model; report: typeof report }) =>
      buildFacts(project, buildIndexes(project), ALL).find((f) => f.label === "Report measures");
    const shown = {
      layer: "report",
      label: "Report measures",
      value: "2",
      detail: "defined in the report, not the model",
    };
    expect(measures({ model, report })).toEqual({ ...shown, ruleId: "REPORT_LEVEL_MEASURES" });
    // A report that reads a published model: the rule leaves its measures alone.
    expect(measures({ report })).toEqual(shown);
  });
  it("says unknown for report measures when reportExtensions.json was not read, and none when it defines none", () => {
    const base = [
      { path: "definition/report.json", text: j({}) },
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p1"], activePageName: "p1" }) },
      page("p1", "Overview"),
    ];
    const measures = (extensions: { path: string; text: string }[]) => {
      const { report } = buildReport([...base, ...extensions]);
      const project = { model, report };
      return buildFacts(project, buildIndexes(project), ALL).find(
        (f) => f.label === "Report measures",
      );
    };
    const extensions = (text: string) => [{ path: "definition/reportExtensions.json", text }];
    const conflicted = [
      "{",
      "<<<<<<< HEAD",
      '  "entities": []',
      "=======",
      "}",
      ">>>>>>> theirs",
    ].join("\n");
    // In the input and not read: invalid JSON, a merge conflict, or a document that is not an
    // object. The rule cannot report measures it did not read, so the fact links none.
    for (const text of ['{ "entities": [', conflicted, "[]"])
      expect(measures(extensions(text))).toEqual({
        layer: "report",
        label: "Report measures",
        value: "unknown",
        detail: "reportExtensions.json was not read",
      });
    const none = { layer: "report", label: "Report measures", value: "none" };
    // No reportExtensions.json in the input, or one that defines no measures.
    expect(measures([])).toEqual(none);
    expect(measures(extensions(j({ entities: [] })))).toEqual(none);
    expect(measures(extensions(j({ entities: [{ name: "Sales", measures: [] }] })))).toEqual(none);
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
    // No policy is given, so FILTERS_PANE_STATE cannot fire and the pane links no rule.
    expect(f2[1]).toEqual({ layer: "report", label: "Filters pane", value: "closed" });
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
    // No policy is given, so the pane links no rule.
    expect(f[1]).toEqual({
      layer: "report",
      label: "Filters pane",
      value: "open",
      detail: "read as open; report.json does not record it",
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
    const notAnObject = [...pagesOnly, { path: "definition/report.json", text: "[]" }];
    expect(buildReport(notAnObject).report.issues.map((i) => [i.file, i.line, i.reason])).toEqual([
      ["definition/report.json", 1, "not a JSON object (the file holds an array)"],
    ]);
    for (const files of [
      pagesOnly,
      [...pagesOnly, { path: "definition/report.json", text: conflicted }],
      notAnObject,
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
  it("links FILTERS_PANE_STATE from the Filters pane only under an expect policy, and only when the rule ran", () => {
    const pages = [
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p1"], activePageName: "p1" }) },
      page("p1", "Overview"),
    ];
    const pane = (
      files: { path: string; text: string }[],
      known: ReadonlySet<string>,
      options?: ReadonlyMap<string, RuleOptions>,
    ) => {
      const { report } = buildReport([...pages, ...files]);
      return buildFacts({ report }, buildIndexes({ report }), known, options).find(
        (f) => f.label === "Filters pane",
      );
    };
    const saved = [
      {
        path: "definition/report.json",
        text: j({ objects: { outspacePane: [{ properties: { expanded: lit("false") } }] } }),
      },
    ];
    const closed = { layer: "report", label: "Filters pane", value: "closed" };
    const linked = { ...closed, ruleId: "FILTERS_PANE_STATE" };
    // Without a policy the rule runs and can never fire, so the fact links nothing; another
    // rule's options are not the pane's policy.
    expect(pane(saved, ALL)).toEqual(closed);
    expect(pane(saved, ALL, new Map())).toEqual(closed);
    expect(pane(saved, ALL, new Map([["TAB_ORDER_FOLLOWS_LAYOUT", { expect: "layout" }]]))).toEqual(
      closed,
    );
    // Under a policy the fact links the rule whether the saved state meets it or breaks it.
    expect(pane(saved, ALL, policy("closed"))).toEqual(linked);
    expect(pane(saved, ALL, policy("open"))).toEqual(linked);
    // A pane report.json does not record is read as open, and links under a policy the same way.
    expect(pane([{ path: "definition/report.json", text: j({}) }], ALL, policy("closed"))).toEqual({
      layer: "report",
      label: "Filters pane",
      value: "open",
      detail: "read as open; report.json does not record it",
      ruleId: "FILTERS_PANE_STATE",
    });
    // A policy for a rule that did not run links nothing.
    expect(pane(saved, new Set(), policy("closed"))).toEqual(closed);
    // With report.json not read the pane is unknown and links no rule under any policy.
    expect(pane([], ALL, policy("closed"))).toEqual({
      layer: "report",
      label: "Filters pane",
      value: "unknown",
      detail: "report.json was not read",
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
    const notAnObject = buildReport([
      { path: "definition/report.json", text: j({}) },
      { path: "definition/pages/pages.json", text: "[]" },
      page("a", "Alpha"),
      page("b", "Beta"),
    ]).report;
    expect(notAnObject.issues.map((i) => [i.file, i.line, i.reason])).toEqual([
      ["definition/pages/pages.json", 1, "not a JSON object (the file holds an array)"],
    ]);
    expect(
      buildFacts({ report: notAnObject }, buildIndexes({ report: notAnObject }), ALL)[0],
    ).toEqual(unknown);
  });
  it("counts a tooltip page by page.json's own type or its pageBinding, once for both", () => {
    // Microsoft's page schema marks a tooltip page either way; Desktop-saved reports mark most by
    // `type` alone.
    for (const marks of [
      { type: "Tooltip" },
      { pageBinding: { type: "Tooltip" } },
      { type: "Tooltip", pageBinding: { type: "Tooltip" } },
    ]) {
      const { report } = buildReport([page("p1", "Overview"), page("p2", "Tips", marks)]);
      expect(
        buildFacts({ report }, buildIndexes({ report }), ALL).find((f) => f.label === "Pages"),
      ).toEqual({
        layer: "report",
        label: "Pages",
        value: "2",
        detail: "1 tooltip",
        ruleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
      });
    }
  });
  it("counts a drillthrough page by its pageBinding, once when page.json's own type marks it too", () => {
    // Read the way HIDE_TOOLTIP_DRILLTROUGH_PAGES reads it.
    for (const marks of [
      { pageBinding: { type: "Drillthrough" } },
      { type: "Drillthrough", pageBinding: { type: "Drillthrough" } },
    ]) {
      const { report } = buildReport([page("p1", "Overview"), page("p2", "Detail", marks)]);
      expect(
        buildFacts({ report }, buildIndexes({ report }), ALL).find((f) => f.label === "Pages"),
      ).toEqual({
        layer: "report",
        label: "Pages",
        value: "2",
        detail: "1 drillthrough",
        ruleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
      });
    }
  });
  it("does not count a page marked as a drillthrough by page.json's own type alone", () => {
    // In the research corpus that marking alone is on pages that are no drillthrough target: an
    // ordinary visible page, and hidden navigation pages whose pageBinding type is Default.
    const pagesFact = (marks: Record<string, unknown>) => {
      const { report } = buildReport([page("p1", "Overview"), page("p2", "Sales", marks)]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find((f) => f.label === "Pages");
    };
    expect(pagesFact({ type: "Drillthrough" })).toEqual({
      layer: "report",
      label: "Pages",
      value: "2",
    });
    expect(
      pagesFact({
        type: "Drillthrough",
        visibility: "HiddenInViewMode",
        pageBinding: { type: "Default" },
      }),
    ).toEqual({ layer: "report", label: "Pages", value: "2", detail: "1 hidden" });
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
  it("counts a visual hidden through its group as hidden, the reading HIDDEN_VISUAL_WITH_FIELDS shares", () => {
    // Hiding a group hides every visual in it, whether or not each visual carries isHidden itself.
    // Groups are not counted as visuals; a visual in a visible group is not hidden.
    const group = (pageId: string, name: string, extra: Record<string, unknown> = {}) => ({
      path: `definition/pages/${pageId}/visuals/${name}/visual.json`,
      text: j({
        name,
        position: {},
        visualGroup: { displayName: name, groupMode: "ScaleMode" },
        ...extra,
      }),
    });
    const visuals = (hiddenGroup: boolean) => {
      const { report } = buildReport([
        page("p1", "Overview"),
        group("p1", "outer", hiddenGroup ? { isHidden: true } : {}),
        group("p1", "inner", { parentGroupName: "outer" }),
        visual("p1", "bound", "cardVisual", { parentGroupName: "outer" }, [
          column("Sales", "Amount"),
        ]),
        visual("p1", "note", "textbox", { parentGroupName: "inner" }),
        visual("p1", "loose", "cardVisual", {}, [column("Sales", "Amount")]),
      ]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Visuals",
      );
    };
    expect(visuals(true)).toEqual({
      layer: "report",
      label: "Visuals",
      value: "3",
      detail: "2 hidden",
      ruleId: "HIDDEN_VISUAL_WITH_FIELDS",
    });
    expect(visuals(false)).toEqual({ layer: "report", label: "Visuals", value: "3" });
  });
  describe("Slicers", () => {
    const region = [column("Sales", "Region")];
    /** A visual of the given type whose general entry holds a saved selection of West. */
    const selecting = (name: string, type: string) =>
      visual("p1", name, type, {}, region, {
        objects: {
          general: [
            {
              properties: {
                filter: {
                  filter: {
                    Version: 2,
                    From: [{ Name: "s", Entity: "Sales", Type: 0 }],
                    Where: [
                      {
                        Condition: {
                          In: {
                            Expressions: [
                              {
                                Column: {
                                  Expression: { SourceRef: { Source: "s" } },
                                  Property: "Region",
                                },
                              },
                            ],
                            Values: [[{ Literal: { Value: "'West'" } }]],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      });
    const clearSlicer = visual("p1", "clear", "slicer", {}, region);
    const savedSlicer = selecting("saved", "slicer");
    const chiclet = selecting("chiclet", "ChicletSlicer1448559807354");
    const hierarchy = selecting("hierarchy", "HierarchySlicer1458836712039");
    // A custom visual with general settings and no filter carries no selection.
    const plainChiclet = visual("p1", "plain", "ChicletSlicer1448559807354", {}, region, {
      objects: { general: [{ properties: { selfFilterEnabled: lit("true") } }] },
    });
    const table = visual("p1", "table", "tableEx", {}, region);
    const slicers = (...visuals: { path: string; text: string }[]) => {
      const { report } = buildReport([page("p1", "Overview"), ...visuals]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Slicers",
      );
    };

    it("counts the built-in slicers, and every saved selection, naming those on custom slicers", () => {
      // The reviewer's mixed case: a built-in slicer with nothing selected, a Chiclet Slicer with a
      // selection, one without, and a table. The Chiclets are not counted as slicers; the one with
      // a selection is named in the detail.
      expect(slicers(clearSlicer, chiclet, plainChiclet, table)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "1",
        detail: "1 saved selection, 1 on a custom slicer",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      expect(slicers(savedSlicer, clearSlicer, chiclet)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "2 saved selections, 1 on a custom slicer",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      // No clause for custom slicers when every selection is on a built-in one.
      expect(slicers(savedSlicer, clearSlicer)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "1 saved selection",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      // Built-in slicers with nothing selected link no rule, since none fires.
      expect(slicers(clearSlicer, plainChiclet)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "1",
        detail: "no saved selection",
      });
    });
    it("reads none, with the selections in the detail, when only custom slicers carry one", () => {
      expect(slicers(chiclet, hierarchy, table)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "none",
        detail: "2 saved selections, 2 on custom slicers",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      expect(slicers(chiclet)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "none",
        detail: "1 saved selection, 1 on a custom slicer",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      // No built-in slicer and no selection: none, as before.
      expect(slicers(plainChiclet, table)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "none",
      });
    });
    it("keeps its count when a selection is cleared, so a cleared custom slicer does not read as deleted", () => {
      const cleared = {
        saved: visual("p1", "saved", "slicer", {}, region),
        chiclet: visual("p1", "chiclet", "ChicletSlicer1448559807354", {}, region),
        hierarchy: visual("p1", "hierarchy", "HierarchySlicer1458836712039", {}, region),
      };
      for (const [selected, clear] of [
        [[chiclet], [cleared.chiclet]],
        [
          [savedSlicer, chiclet, hierarchy],
          [cleared.saved, cleared.chiclet, cleared.hierarchy],
        ],
        [
          [clearSlicer, chiclet, plainChiclet],
          [clearSlicer, cleared.chiclet, plainChiclet],
        ],
      ]) {
        const names = selected!.map((v) => v.path).join(", ");
        expect(slicers(...clear!)!.value, names).toBe(slicers(...selected!)!.value);
      }
    });
  });
  it("says the not-reached clause of Model is unknown when a report file could not be read, and links no rule", () => {
    const modelFact = (...extra: { path: string; text: string }[]) => {
      const { report } = buildReport([...files, ...extra]);
      const project = { model, report };
      return buildFacts(project, buildIndexes(project), ALL).find((f) => f.label === "Model");
    };
    const counted = {
      layer: "model",
      label: "Model",
      value: "1 table, 2 columns, 2 measures",
    };
    const unknown = {
      ...counted,
      detail: "not reached from this report: unknown, a report file could not be read",
    };
    // A definition file the PBIR format defines, unread for any of the three reasons: the rule is
    // skipped, and what the file would have reached is not known, so the fact links no rule.
    expect(
      modelFact({ path: "definition/pages/p1/visuals/v9/visual.json", text: '{ "name": "v9", ' }),
    ).toEqual(unknown);
    expect(
      modelFact({ path: "definition/pages/p1/visuals/v9/visual.json", text: "<<<<<<< HEAD\n{}\n" }),
    ).toEqual(unknown);
    expect(modelFact({ path: "definition/pages/p1/visuals/v9/visual.json", text: "[]" })).toEqual(
      unknown,
    );
    // Unchanged when the file that could not be read is the report's .platform or the author's own.
    const reached = {
      ...counted,
      detail: "0 columns and 1 measure not reached from this report",
      ruleId: "NOT_REACHED_FROM_REPORT",
    };
    expect(modelFact({ path: ".platform", text: "{" })).toEqual(reached);
    expect(modelFact({ path: "definition/notes/owners.json", text: "{" })).toEqual(reached);
    expect(modelFact()).toEqual(reached);
  });
  it("counts what is not reached while a definition file that holds no field reference could not be read, and says unknown for one that holds them", () => {
    /** The Model fact with each extra file taking the place of a file at its path. */
    const modelFact = (...extra: { path: string; text: string }[]) => {
      const kept = files.filter((f) => !extra.some((e) => e.path === f.path));
      const { report } = buildReport([...kept, ...extra]);
      const project = { model, report };
      return buildFacts(project, buildIndexes(project), ALL).find((f) => f.label === "Model");
    };
    const counted = { layer: "model", label: "Model", value: "1 table, 2 columns, 2 measures" };
    const reached = {
      ...counted,
      detail: "0 columns and 1 measure not reached from this report",
      ruleId: "NOT_REACHED_FROM_REPORT",
    };
    const unknown = {
      ...counted,
      detail: "not reached from this report: unknown, a report file could not be read",
    };
    const conflicted = "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> main\n";
    for (const path of [
      "definition/version.json",
      "definition/pages/pages.json",
      "definition/bookmarks/bookmarks.json",
      "definition/pages/p1/visuals/v4/mobile.json",
    ])
      expect(modelFact({ path, text: conflicted }), path).toEqual(reached);
    for (const path of [
      "definition/report.json",
      "definition/reportExtensions.json",
      "definition/pages/p2/page.json",
      "definition/bookmarks/b1.bookmark.json",
    ])
      expect(modelFact({ path, text: conflicted }), path).toEqual(unknown);
  });
  describe("the not-reached clause of Model on a model pbiplint could not fully read", () => {
    const SALES = "definition/tables/Sales.tmdl";
    /** The Model fact for the model given, beside every report file in `files`. */
    const modelFact = (m: Model, ...extra: { path: string; text: string }[]) => {
      const { report } = buildReport([...files, ...extra]);
      const project = { model: m, report };
      return buildFacts(project, buildIndexes(project), ALL).find((f) => f.label === "Model");
    };
    // The counts stay, a lower bound, as they do for a report file that could not be read.
    const counted = { layer: "model", label: "Model", value: "1 table, 2 columns, 2 measures" };
    const unknown = {
      ...counted,
      detail: "not reached from this report: unknown, a model file could not be fully read",
    };
    it("says unknown and links no rule while a model file has a parse issue that can drop an object", () => {
      // A line indented with spaces, which the parser skips, so what it declares is not read.
      const partly = buildModel([parseTmdl(SALES, `${sales}    measure Lost = [Other]\n`)]);
      expect(partly.files[0]!.issues.map((i) => i.canDropObjects)).toEqual([true]);
      expect(modelFact(partly)).toEqual(unknown);
    });
    it("says unknown and links no rule while a model path could not be read at all", () => {
      expect(
        modelFact(buildModel([parseTmdl(SALES, sales)], ["definition/tables/Store.tmdl"])),
      ).toEqual(unknown);
      expect(modelFact(buildModel([parseTmdl(SALES, sales)], ["definition/tables/"]))).toEqual(
        unknown,
      );
    });
    it("counts while the only parse issue is an orphaned description, which drops no declaration", () => {
      const described = buildModel([
        parseTmdl(
          SALES,
          sales.replace("\tcolumn Region\n", "\t/// Described\n\n\tcolumn Region\n"),
        ),
      ]);
      expect(described.files[0]!.issues.map((i) => i.canDropObjects)).toEqual([false]);
      expect(modelFact(described)).toEqual({
        ...counted,
        detail: "0 columns and 1 measure not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      });
    });
    it("gives the report file's reason when a report file could not be read as well", () => {
      const both = buildModel([parseTmdl(SALES, sales)], ["definition/tables/Store.tmdl"]);
      expect(
        modelFact(both, { path: "definition/pages/p1/visuals/v9/visual.json", text: "[]" }),
      ).toEqual({
        ...counted,
        detail: "not reached from this report: unknown, a report file could not be read",
      });
    });
  });
  it("counts an unread report folder as every file it could hold, for each fact that asks", () => {
    /** The facts with the files under each unread folder left out, as a reader that could not list it. */
    const factsBeside = (...folders: string[]) => {
      const kept = files.filter((f) => !folders.some((d) => f.path.startsWith(d)));
      const { report } = buildReport(kept, folders);
      const project = { model, report };
      return buildFacts(project, buildIndexes(project), ALL);
    };
    const fact = (label: string, ...folders: string[]) =>
      factsBeside(...folders).find((f) => f.label === label);
    // A visual's own folder could hold its visual.json and its mobile.json.
    const visualFolder = "definition/pages/p1/visuals/v9/";
    expect(fact("Slicers", visualFolder)).toMatchObject({
      value: "2",
      detail: "1 saved selection",
    });
    expect(fact("Visuals", visualFolder)?.detail).toBe(
      "1 hidden; 2 custom visual types registered, used: unknown, a visual.json could not be read",
    );
    expect(fact("Model", visualFolder)?.detail).toBe(
      "not reached from this report: unknown, a report file could not be read",
    );
    // With every visual of the only page with visuals unread, none of them is counted.
    expect(fact("Slicers", "definition/pages/p1/visuals/")).toEqual({
      layer: "report",
      label: "Slicers",
      value: "unknown",
      detail: "saved selections: unknown, a visual.json could not be read",
    });
    expect(fact("Mobile layouts", "definition/pages/p1/visuals/")).toEqual({
      layer: "report",
      label: "Mobile layouts",
      value: "unknown",
      detail: "a mobile.json could not be read",
    });
    // The bookmarks folder holds bookmark files, which name fields, and no visual.
    expect(fact("Model", "definition/bookmarks/")?.detail).toBe(
      "not reached from this report: unknown, a report file could not be read",
    );
    expect(fact("Visuals", "definition/bookmarks/")?.detail).toBe(
      "1 hidden; 2 custom visual types registered, 1 used",
    );
    // A page's folder names the page, as its page.json does.
    const opensOn = factsBeside("definition/pages/p1/").find((f) => f.label === "Opens on");
    expect(opensOn).toEqual({
      layer: "report",
      label: "Opens on",
      value: "p1",
      detail: "the page open when it was saved; no landing page set",
      ruleId: "LANDING_PAGE_NOT_SET",
    });
    // definition/ itself holds reportExtensions.json.
    expect(fact("Report measures", "definition/")).toEqual({
      layer: "report",
      label: "Report measures",
      value: "unknown",
      detail: "reportExtensions.json was not read",
    });
  });
  describe("a count that would read 0 while what it counts could not be read", () => {
    type Files = { path: string; text: string }[];
    const pagesJson = {
      path: "definition/pages/pages.json",
      text: j({ pageOrder: ["p1"], activePageName: "p1" }),
    };
    /** The report fact labelled `label`, the report built from `given` beside `unreadPaths`. */
    const reportFact = (label: string, given: Files, unreadPaths: string[] = []) => {
      const { report } = buildReport(given, unreadPaths);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find((f) => f.label === label);
    };
    it("reads Pages unknown while a page.json, or a folder that could hold one, could not be read", () => {
      const unknown = {
        layer: "report",
        label: "Pages",
        value: "unknown",
        detail: "a page.json could not be read",
      };
      // The review's case: the pages folder could not be listed, pages.json names the page open
      // when the report was saved, and Opens on names it; 0 pages beside it would say it is not
      // there.
      expect(reportFact("Opens on", [pagesJson], ["definition/pages/"])).toMatchObject({
        value: "p1",
      });
      expect(reportFact("Pages", [pagesJson], ["definition/pages/"])).toEqual(unknown);
      // A page.json that failed to parse, or that the reader could not read, or the page's
      // folder, or definition/ above it.
      expect(
        reportFact("Pages", [pagesJson, { path: "definition/pages/p1/page.json", text: "{" }]),
      ).toEqual(unknown);
      for (const path of ["definition/pages/p1/page.json", "definition/pages/p1/", "definition/"])
        expect(reportFact("Pages", [pagesJson], [path]), path).toEqual(unknown);
      // A count above 0 is a lower bound and stays.
      const one = [pagesJson, page("p1", "Overview")];
      expect(
        reportFact("Pages", [...one, { path: "definition/pages/p2/page.json", text: "{" }]),
      ).toEqual({ layer: "report", label: "Pages", value: "1" });
      expect(reportFact("Pages", one, ["definition/pages/p2/"])).toEqual({
        layer: "report",
        label: "Pages",
        value: "1",
      });
      // With nothing unread that could hold a page, 0 is true: pages.json lists the order, and
      // the bookmarks folder holds no page.
      const zero = { layer: "report", label: "Pages", value: "0" };
      expect(reportFact("Pages", [pagesJson])).toEqual(zero);
      expect(reportFact("Pages", [pagesJson], ["definition/bookmarks/"])).toEqual(zero);
      expect(
        reportFact("Pages", [{ path: "definition/pages/pages.json", text: "<<<<<<< HEAD\n{}\n" }]),
      ).toEqual(zero);
    });
    it("reads Visuals unknown while a visual.json, or a folder that could hold one, could not be read, naming the reason once", () => {
      const onP1 = [page("p1", "Overview")];
      const unreadVisual = { path: "definition/pages/p1/visuals/v9/visual.json", text: "{" };
      const unknown = {
        layer: "report",
        label: "Visuals",
        value: "unknown",
        detail: "a visual.json could not be read",
      };
      expect(reportFact("Visuals", [...onP1, unreadVisual])).toEqual(unknown);
      for (const path of [
        "definition/pages/p1/visuals/v9/visual.json",
        "definition/pages/p1/visuals/",
        "definition/pages/p1/",
        "definition/pages/",
      ])
        expect(reportFact("Visuals", onP1, [path]), path).toEqual(unknown);
      // A registered custom visual type's used count is unknown for the same reason, and the
      // detail gives the reason once, at its end, as the Slicers fact does.
      const registered = {
        path: "definition/report.json",
        text: j({ publicCustomVisuals: ["Used123"] }),
      };
      expect(reportFact("Visuals", [registered, ...onP1, unreadVisual])).toEqual({
        ...unknown,
        detail: "1 custom visual type registered, used: unknown, a visual.json could not be read",
      });
      // A count above 0 is a lower bound and stays.
      expect(reportFact("Visuals", [...onP1, visual("p1", "v1", "card"), unreadVisual])).toEqual({
        layer: "report",
        label: "Visuals",
        value: "1",
      });
      // With nothing unread that could hold a visual, 0 is true, and REMOVE_UNUSED_CUSTOM_VISUALS
      // can fire on a registered type no visual uses.
      const zero = { layer: "report", label: "Visuals", value: "0" };
      expect(reportFact("Visuals", onP1)).toEqual(zero);
      for (const file of [
        { path: "definition/pages/p9/page.json", text: "{" },
        { path: "definition/pages/p1/visuals/v9/mobile.json", text: "{" },
      ])
        expect(reportFact("Visuals", [...onP1, file]), file.path).toEqual(zero);
      expect(reportFact("Visuals", [registered, ...onP1])).toEqual({
        ...zero,
        detail: "1 custom visual type registered, 0 used",
        ruleId: "REMOVE_UNUSED_CUSTOM_VISUALS",
      });
    });
    describe("the Model counts", () => {
      const MODEL = { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" };
      const SALES = "definition/tables/Sales.tmdl";
      const columnsOnly =
        "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tcolumn Region\n\t\tdataType: string\n";
      /** The Model fact for the model's files and unread paths, beside every report file in `files`. */
      const modelFact = (tmdl: Files, unreadPaths: string[] = [], ...extra: Files) => {
        const m = buildModel(
          tmdl.map((f) => parseTmdl(f.path, f.text)),
          unreadPaths,
        );
        const { report } = buildReport([...files, ...extra]);
        const project = { model: m, report };
        return buildFacts(project, buildIndexes(project), ALL).find((f) => f.label === "Model");
      };
      const modelUnread =
        "not reached from this report: unknown, a model file could not be fully read";
      const reportUnread = "not reached from this report: unknown, a report file could not be read";
      const unreadVisual = { path: "definition/pages/p1/visuals/v9/visual.json", text: "[]" };
      it("reads each count that would be 0 as unknown while the model could not be fully read", () => {
        // The tables folder could not be listed: every count would read 0.
        expect(modelFact([MODEL], ["definition/tables/"])).toEqual({
          layer: "model",
          label: "Model",
          value: "tables: unknown, columns: unknown, measures: unknown",
          detail: modelUnread,
        });
        // Only the counts that would read 0; a count above 0 is a lower bound and stays.
        expect(
          modelFact([MODEL, { path: SALES, text: columnsOnly }], ["definition/tables/Store.tmdl"]),
        ).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, 2 columns, measures: unknown",
          detail: modelUnread,
        });
        expect(
          modelFact(
            [MODEL, { path: SALES, text: "table Sales\n\tmeasure Total = 1\n" }],
            ["definition/tables/"],
          ),
        ).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, columns: unknown, 1 measure",
          detail: modelUnread,
        });
        // A parse issue that can drop an object: a line indented with spaces, which the parser
        // skips, so the measure it declares is not read.
        expect(
          modelFact([MODEL, { path: SALES, text: `${columnsOnly}    measure Lost = 1\n` }]),
        ).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, 2 columns, measures: unknown",
          detail: modelUnread,
        });
        expect(modelFact([MODEL, { path: SALES, text: sales }], ["definition/tables/"])).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, 2 columns, 2 measures",
          detail: modelUnread,
        });
      });
      it("adds the model's reason when the not-reached clause gives the report file's", () => {
        expect(
          modelFact(
            [MODEL, { path: SALES, text: columnsOnly }],
            ["definition/tables/Store.tmdl"],
            unreadVisual,
          ),
        ).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, 2 columns, measures: unknown",
          detail: `${reportUnread}; a model file could not be fully read`,
        });
        // With no count unknown, the report file's reason is the only one given, as before.
        expect(
          modelFact([MODEL, { path: SALES, text: sales }], ["definition/tables/"], unreadVisual),
        ).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, 2 columns, 2 measures",
          detail: reportUnread,
        });
      });
      it("keeps a true 0, and a 0 a report file that could not be read cannot change", () => {
        expect(modelFact([MODEL])).toEqual({
          layer: "model",
          label: "Model",
          value: "0 tables, 0 columns, 0 measures",
          detail: "0 columns and 0 measures not reached from this report",
        });
        // A report file holds no model object, so the counts come from the model's reading alone.
        expect(modelFact([MODEL, { path: SALES, text: columnsOnly }], [], unreadVisual)).toEqual({
          layer: "model",
          label: "Model",
          value: "1 table, 2 columns, 0 measures",
          detail: reportUnread,
        });
      });
    });
  });
  describe("Model and Desktop's auto date/time tables", () => {
    // With Auto date/time on, Power BI Desktop adds a calculated LocalDateTable_<guid> per date
    // column and a calculated DateTableTemplate_<guid>, and keeps both hidden even from modelers,
    // so the fact counts the tables Desktop shows.
    const LDT = "LocalDateTable_1b2c1fde-0cf3-455e-bfee-a8e4970804e0";
    const DTT = "DateTableTemplate_f2afc5fc-2d0d-478c-92e8-dc0f26f32175";
    /** A hidden table of two date columns over the partition given, as Desktop saves its auto tables. */
    const dateTable = (name: string, partition: string) =>
      `table ${name}\n\tisHidden\n\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisHidden\n\n\tcolumn Year\n\t\tdataType: int64\n\t\tisHidden\n\n\tpartition ${name} = ${partition}\n`;
    const calculated = (source: string) => `calculated\n\t\tmode: import\n\t\tsource = ${source}\n`;
    const store =
      "table Store\n\tcolumn Name\n\t\tdataType: string\n\tcolumn Opened\n\t\tdataType: dateTime\n";
    const autoPair =
      dateTable(
        LDT,
        calculated(
          "Calendar(Date(Year(MIN('Store'[Opened])), 1, 1), Date(Year(MAX('Store'[Opened])), 12, 31))",
        ),
      ) + dateTable(DTT, calculated("Calendar(Date(2015,1,1), Date(2015,1,1))"));
    const modelFact = (tmdl: string, ...extra: { path: string; text: string }[]) => {
      const { report } = buildReport([...files, ...extra]);
      const project = { model: modelFrom(tmdl), report };
      return buildFacts(project, buildIndexes(project), ALL).find((f) => f.label === "Model");
    };
    it("counts neither the calculated LocalDateTable_ and DateTableTemplate_ tables nor their columns", () => {
      const shown = { layer: "model", label: "Model", value: "2 tables, 4 columns, 2 measures" };
      expect(modelFact(sales + store + autoPair)).toEqual({
        ...shown,
        detail: "2 columns and 1 measure not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      });
      // The counts stay those of the tables Desktop shows when the not-reached clause is unknown.
      expect(
        modelFact(sales + store + autoPair, {
          path: "definition/pages/p1/visuals/v9/visual.json",
          text: "[]",
        }),
      ).toEqual({
        ...shown,
        detail: "not reached from this report: unknown, a report file could not be read",
      });
    });
    it("counts a LocalDateTable_ table that is not calculated, such as a composite model's copy with an entity partition", () => {
      // The copy a composite model makes of a published model's auto table reads from that model,
      // so it is not one of the tables Desktop adds to this one; the calculated pair beside it is.
      const copy = dateTable(
        "LocalDateTable_6d3e2a1b-4c5f-4e7a-9b8c-0d1e2f3a4b5c",
        "entity\n\t\tmode: directQuery\n\t\tsource\n\t\t\tentityName: LocalDateTable_6d3e2a1b-4c5f-4e7a-9b8c-0d1e2f3a4b5c\n\t\t\texpressionSource: 'DirectQuery to AS - Sales'\n",
      );
      expect(modelFact(sales + store + copy + autoPair)).toEqual({
        layer: "model",
        label: "Model",
        value: "3 tables, 6 columns, 2 measures",
        detail: "4 columns and 1 measure not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      });
    });
    it("reads a model without auto date/time tables as before, an ordinary calculated table included", () => {
      const grouping =
        "table 'Store Grouping'\n\tcolumn Name\n\t\tdataType: string\n\n\tpartition 'Store Grouping' = calculated\n\t\tmode: import\n\t\tsource = DISTINCT('Store'[Name])\n";
      expect(modelFact(sales + store + grouping)).toEqual({
        layer: "model",
        label: "Model",
        value: "3 tables, 5 columns, 2 measures",
        detail: "3 columns and 1 measure not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      });
    });
  });
  it("says how many registered custom visual types are used is unknown while a visual.json could not be read, and links no rule for it", () => {
    const visualsFact = (...extra: { path: string; text: string }[]) => {
      const { report } = buildReport([...files, ...extra]);
      const project = { model, report };
      return buildFacts(
        project,
        buildIndexes(project),
        new Set(["REMOVE_UNUSED_CUSTOM_VISUALS"]),
      ).find((f) => f.label === "Visuals");
    };
    const counted = { layer: "report", label: "Visuals", value: "4" };
    expect(visualsFact()).toEqual({
      ...counted,
      detail: "1 hidden; 2 custom visual types registered, 1 used",
      ruleId: "REMOVE_UNUSED_CUSTOM_VISUALS",
    });
    expect(
      visualsFact({ path: "definition/pages/p1/visuals/v9/visual.json", text: '{ "name": "v9", ' }),
    ).toEqual({
      ...counted,
      detail:
        "1 hidden; 2 custom visual types registered, used: unknown, a visual.json could not be read",
    });
    // A page.json or a mobile.json that could not be read holds no visual's type.
    expect(visualsFact({ path: "definition/pages/p9/page.json", text: "{" })).toEqual(
      visualsFact(),
    );
    expect(visualsFact({ path: "definition/pages/p1/visuals/v2/mobile.json", text: "{" })).toEqual(
      visualsFact(),
    );
    // Every registered type used by a visual that was read: the unread one cannot change the count.
    const allUsed = buildReport([
      {
        path: "definition/report.json",
        text: j({ publicCustomVisuals: ["Used123"] }),
      },
      page("p1", "Overview"),
      visual("p1", "v4", "Used123"),
      { path: "definition/pages/p1/visuals/v9/visual.json", text: "[]" },
    ]).report;
    expect(
      buildFacts({ report: allUsed }, buildIndexes({ report: allUsed }), ALL).find(
        (f) => f.label === "Visuals",
      ),
    ).toEqual({
      layer: "report",
      label: "Visuals",
      value: "1",
      detail: "1 custom visual type registered, 1 used",
    });
  });
  it("says unknown for slicers or saved selections only where a visual.json that could not be read could change it", () => {
    const region = [column("Sales", "Region")];
    const selection = {
      objects: {
        general: [
          {
            properties: {
              filter: {
                filter: {
                  Version: 2,
                  From: [{ Name: "s", Entity: "Sales", Type: 0 }],
                  Where: [
                    {
                      Condition: {
                        In: {
                          Expressions: [
                            {
                              Column: {
                                Expression: { SourceRef: { Source: "s" } },
                                Property: "Region",
                              },
                            },
                          ],
                          Values: [[{ Literal: { Value: "'West'" } }]],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    };
    const clearSlicer = visual("p1", "clear", "slicer", {}, region);
    const savedSlicer = visual("p1", "saved", "slicer", {}, region, selection);
    const chiclet = visual("p1", "chiclet", "ChicletSlicer1448559807354", {}, region, selection);
    const table = visual("p1", "table", "tableEx", {}, region);
    const unread = { path: "definition/pages/p1/visuals/v9/visual.json", text: '{ "name": "v9", ' };
    const slicers = (...visuals: { path: string; text: string }[]) => {
      const { report } = buildReport([page("p1", "Overview"), ...visuals]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Slicers",
      );
    };
    const row = (value: string, detail: string, ruleId?: string) => ({
      layer: "report",
      label: "Slicers",
      value,
      detail,
      ...(ruleId ? { ruleId } : {}),
    });
    const unknownSelections = "saved selections: unknown, a visual.json could not be read";
    // The unread visual could be a slicer, or carry a selection: neither "none" nor "no saved
    // selection" can be said.
    expect(slicers(table, unread)).toEqual(row("unknown", unknownSelections));
    expect(slicers(clearSlicer, unread)).toEqual(row("1", unknownSelections));
    expect(slicers(chiclet, unread)).toEqual(
      row(
        "unknown",
        "1 saved selection, 1 on a custom slicer; a visual.json could not be read",
        "SLICER_SELECTION_SAVED",
      ),
    );
    // Counts that never read none are lower bounds and stay as they are.
    expect(slicers(savedSlicer, chiclet, unread)).toEqual(
      row("1", "2 saved selections, 1 on a custom slicer", "SLICER_SELECTION_SAVED"),
    );
    // A page.json or a mobile.json that could not be read holds no visual.
    for (const file of [
      { path: "definition/pages/p9/page.json", text: "{" },
      { path: "definition/pages/p1/visuals/table/mobile.json", text: "{" },
    ]) {
      expect(slicers(table, file), file.path).toEqual({
        layer: "report",
        label: "Slicers",
        value: "none",
      });
      expect(slicers(clearSlicer, file), file.path).toEqual(row("1", "no saved selection"));
    }
  });
  it("says unknown for mobile layouts only when a mobile.json that could not be read could add one", () => {
    const mobile = (...extra: { path: string; text: string }[]) => {
      const { report } = buildReport([
        page("p1", "Overview"),
        page("p2", "Detail"),
        visual("p1", "a", "card"),
        visual("p2", "b", "card"),
        ...extra,
      ]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Mobile layouts",
      );
    };
    const unreadMobile = { path: "definition/pages/p1/visuals/a/mobile.json", text: "{" };
    expect(mobile(unreadMobile)).toEqual({
      layer: "report",
      label: "Mobile layouts",
      value: "unknown",
      detail: "a mobile.json could not be read",
    });
    // A count that is not none is a lower bound and stays.
    expect(
      mobile(unreadMobile, { path: "definition/pages/p2/visuals/b/mobile.json", text: j({}) }),
    ).toEqual({ layer: "report", label: "Mobile layouts", value: "1 of 2 pages" });
    // A visual.json or a page.json that could not be read holds no mobile layout.
    for (const file of [
      { path: "definition/pages/p1/visuals/c/visual.json", text: "{" },
      { path: "definition/pages/p3/page.json", text: "{" },
    ])
      expect(mobile(file), file.path).toEqual({
        layer: "report",
        label: "Mobile layouts",
        value: "none",
      });
  });
  it("counts a page by the mobile.json read in its folder, even when that visual's visual.json could not be read", () => {
    const { report } = buildReport([
      page("p1", "Overview"),
      page("p2", "Detail"),
      visual("p2", "b", "card"),
      // p1's only visual: its visual.json is invalid, its mobile.json was read.
      { path: "definition/pages/p1/visuals/a/visual.json", text: '{ "name": "a", ' },
      { path: "definition/pages/p1/visuals/a/mobile.json", text: j({ position: {} }) },
    ]);
    expect(
      buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Mobile layouts",
      ),
    ).toEqual({ layer: "report", label: "Mobile layouts", value: "1 of 2 pages" });
    // A mobile.json read in a folder with no page to count, since neither the page.json nor any
    // visual.json there could be read: the fact cannot say none.
    const orphan = buildReport([
      page("p2", "Detail"),
      visual("p2", "b", "card"),
      { path: "definition/pages/p1/page.json", text: "{" },
      { path: "definition/pages/p1/visuals/a/visual.json", text: "{" },
      { path: "definition/pages/p1/visuals/a/mobile.json", text: j({ position: {} }) },
    ]).report;
    expect(
      buildFacts({ report: orphan }, buildIndexes({ report: orphan }), ALL).find(
        (f) => f.label === "Mobile layouts",
      ),
    ).toEqual({
      layer: "report",
      label: "Mobile layouts",
      value: "unknown",
      detail: "a page with a mobile layout could not be read",
    });
    const mobileFact = (...extra: { path: string; text: string }[]) => {
      const { report } = buildReport([page("p2", "Detail"), visual("p2", "b", "card"), ...extra]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Mobile layouts",
      );
    };
    const strayMobile = { path: "definition/pages/p1/visuals/a/mobile.json", text: j({}) };
    // An unread visual.json alone in that folder, with no page.json in the input, is enough.
    expect(
      mobileFact({ path: "definition/pages/p1/visuals/a/visual.json", text: "{" }, strayMobile),
    ).toEqual({
      layer: "report",
      label: "Mobile layouts",
      value: "unknown",
      detail: "a page with a mobile layout could not be read",
    });
    // A stray mobile.json in a folder with no page.json and no visual.json, where nothing failed
    // to read: no unread file could define a page there, so none is true.
    expect(mobileFact(strayMobile)).toEqual({
      layer: "report",
      label: "Mobile layouts",
      value: "none",
    });
    // Nor does a file that could not be read in another page's folder make it unknown.
    expect(
      mobileFact(strayMobile, { path: "definition/pages/p3/visuals/c/visual.json", text: "{" }),
    ).toEqual({ layer: "report", label: "Mobile layouts", value: "none" });
  });
  it("names an opening page whose page.json could not be read as pages.json names it, and never calls it missing", () => {
    const opensOn = (header: Record<string, unknown>) => {
      const { report } = buildReport([
        { path: "definition/pages/pages.json", text: j({ pageOrder: ["p1", "u"], ...header }) },
        page("p1", "Overview"),
        { path: "definition/pages/u/page.json", text: "<<<<<<< HEAD\n{}\n" },
      ]);
      return buildFacts({ report }, buildIndexes({ report }), ALL).find(
        (f) => f.label === "Opens on",
      );
    };
    expect(opensOn({ activePageName: "p1", landingPageName: "u" })).toEqual({
      layer: "report",
      label: "Opens on",
      value: "u",
      detail: "landing page",
    });
    expect(opensOn({ activePageName: "u" })).toEqual({
      layer: "report",
      label: "Opens on",
      value: "u",
      detail: "the page open when it was saved; no landing page set",
      ruleId: "LANDING_PAGE_NOT_SET",
    });
  });
  it("gives a model-only run no facts at all, because the block is about the report", () => {
    expect(buildFacts({ model }, buildIndexes({ model }), ALL)).toEqual([]);
  });
});
