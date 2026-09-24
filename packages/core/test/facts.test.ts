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
        ruleId: "REPORT_LEVEL_MEASURES",
      },
      {
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "1 with a saved selection",
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
  it("counts a drillthrough page by page.json's own type or its pageBinding, once for both", () => {
    // The same two markings, read the way HIDE_TOOLTIP_DRILLTROUGH_PAGES reads them.
    for (const marks of [
      { type: "Drillthrough" },
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

    it("counts a custom slicer with a saved selection among the slicers and those with one, the reading SLICER_SELECTION_SAVED shares", () => {
      // A catalog slicer with nothing selected is still a slicer; a custom visual with nothing
      // selected, and a table, are not counted.
      expect(slicers(clearSlicer, chiclet, plainChiclet, table)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "1 with a saved selection",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      // Custom slicers alone, each with a selection, make both numbers.
      expect(slicers(chiclet, hierarchy)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "2 with a saved selection",
        ruleId: "SLICER_SELECTION_SAVED",
      });
      // A catalog slicer with nothing selected counts, and links no rule, since none fires.
      expect(slicers(clearSlicer, plainChiclet)).toEqual({
        layer: "report",
        label: "Slicers",
        value: "1",
        detail: "0 with a saved selection",
      });
    });
    it("never counts more slicers with a saved selection than slicers", () => {
      for (const visuals of [
        [clearSlicer],
        [chiclet],
        [plainChiclet, table],
        [clearSlicer, chiclet],
        [clearSlicer, chiclet, hierarchy],
        [savedSlicer, chiclet, hierarchy, plainChiclet],
      ]) {
        const fact = slicers(...visuals)!;
        const count = fact.value === "none" ? 0 : Number(fact.value);
        const saved = fact.detail === undefined ? 0 : Number(/^(\d+) with/.exec(fact.detail)![1]);
        expect(saved, visuals.map((v) => v.path).join(", ")).toBeLessThanOrEqual(count);
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
      detail:
        "columns and measures not reached from this report: unknown, a report file could not be read",
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
  it("gives a model-only run no facts at all, because the block is about the report", () => {
    expect(buildFacts({ model }, buildIndexes({ model }), ALL)).toEqual([]);
  });
});
