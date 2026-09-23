import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { BROKEN_ACTION_TARGET, BROKEN_BOOKMARK_REFERENCE } from "../src/rules/pbiplint/actions.js";
import { TAB_ORDER_FOLLOWS_LAYOUT } from "../src/rules/pbiplint/tab-order.js";
import { SLICER_SELECTION_SAVED } from "../src/rules/pbiplint/visuals.js";
import {
  column,
  j,
  lineOf,
  lit,
  measure,
  page,
  pretty,
  projectFrom,
  reportFindings,
  reportObjectIds,
  visual,
} from "./report-helpers.js";

/** What every tier-3 rule shares: the report layer, built into pbiplint. */
const tier3 = { layer: "report", needs: ["report"], status: "builtin" };

const link = (props: Record<string, unknown>) => ({
  visualContainerObjects: { visualLink: [{ properties: props }] },
});
const bookmarks = [
  { path: "definition/bookmarks/bookmarks.json", text: j({ items: [{ name: "b1" }] }) },
  {
    path: "definition/bookmarks/b1.bookmark.json",
    text: j({
      name: "b1",
      displayName: "Reset",
      explorationState: { activeSection: "p", sections: { p: { visualContainers: { v: {} } } } },
    }),
  },
];
/** A page whose page.json `name` was renamed by hand while Desktop kept its folder. */
const renamed = {
  path: "definition/pages/646039348818b651e02c/page.json",
  text: j({ name: "page_dashboard", displayName: "Dashboard", height: 720, width: 1280 }),
};

describe("BROKEN_ACTION_TARGET", () => {
  it("fires on a page navigation, bookmark, or drillthrough action whose target does not exist", () => {
    const files = [
      page("p"),
      ...bookmarks,
      visual(
        "p",
        "toGone",
        "actionButton",
        {},
        link({ type: lit("'PageNavigation'"), navigationSection: lit("'gone'") }),
      ),
      visual(
        "p",
        "toP",
        "actionButton",
        {},
        link({ type: lit("'PageNavigation'"), navigationSection: lit("'p'") }),
      ),
      visual(
        "p",
        "toBookmark",
        "actionButton",
        {},
        link({ type: lit("'Bookmark'"), bookmark: lit("'b1'") }),
      ),
      visual(
        "p",
        "toNoBookmark",
        "actionButton",
        {},
        link({ type: lit("'Bookmark'"), bookmark: lit("'b9'") }),
      ),
      visual(
        "p",
        "drill",
        "actionButton",
        {},
        link({ type: lit("'Drillthrough'"), drillthroughSection: lit("'nowhere'") }),
      ),
      visual(
        "p",
        "drillToP",
        "actionButton",
        {},
        link({ type: lit("'Drillthrough'"), drillthroughSection: lit("'p'") }),
      ),
      visual(
        "p",
        "web",
        "actionButton",
        {},
        link({ type: lit("'WebUrl'"), webUrl: lit("'https://example.com'") }),
      ),
      visual("p", "back", "actionButton", {}, link({ type: lit("'Back'") })),
    ];
    // Visuals come out in folder order.
    expect(reportFindings(BROKEN_ACTION_TARGET, files).map((f) => [f.objectId, f.detail])).toEqual([
      ["drill", 'Drillthrough action points at page "nowhere", which does not exist'],
      ["toGone", 'Page navigation action points at page "gone", which does not exist'],
      ["toNoBookmark", 'Bookmark action points at bookmark "b9", which does not exist'],
    ]);
  });
  it("reads only the destination the action's type owns, as a literal, on an action that is on", () => {
    const files = [
      page("p"),
      // Desktop keeps the old type's target when the type changes: this entry navigates to p, and
      // the bookmark it still carries names nothing.
      visual(
        "p",
        "leftover",
        "actionButton",
        {},
        link({
          type: lit("'PageNavigation'"),
          navigationSection: lit("'p'"),
          bookmark: lit("'b9'"),
        }),
      ),
      // Switched off, with a target that names nothing.
      visual(
        "p",
        "off",
        "actionButton",
        {},
        link({
          show: lit("false"),
          type: lit("'PageNavigation'"),
          navigationSection: lit("'gone'"),
        }),
      ),
      // A destination set by conditional formatting, which pbiplint cannot evaluate.
      visual(
        "p",
        "fx",
        "actionButton",
        {},
        link({
          type: lit("'PageNavigation'"),
          navigationSection: { expr: measure("Sales", "Destination") },
        }),
      ),
      // No destination at all: a tooltip-only button, empty or absent.
      visual(
        "p",
        "empty",
        "actionButton",
        {},
        link({
          show: lit("true"),
          type: lit("'PageNavigation'"),
          navigationSection: lit("''"),
          tooltip: lit("'Operate'"),
        }),
      ),
      visual(
        "p",
        "absent",
        "actionButton",
        {},
        link({ show: lit("true"), type: lit("'Bookmark'") }),
      ),
    ];
    expect(reportObjectIds(BROKEN_ACTION_TARGET, files)).toEqual([]);
  });
  it("checks every visual that carries an action, hidden or not, whatever the case of its type", () => {
    const files = [
      page("p"),
      visual(
        "p",
        "image",
        "image",
        { isHidden: true },
        link({ type: lit("'PageNavigation'"), navigationSection: lit("'gone'") }),
      ),
      visual("p", "shape", "shape", {}, link({ type: lit("'Bookmark'"), bookmark: lit("'b9'") })),
      visual(
        "p",
        "spelt",
        "actionButton",
        {},
        link({ type: lit("'DrillThrough'"), drillthroughSection: lit("'gone'") }),
      ),
    ];
    expect(reportObjectIds(BROKEN_ACTION_TARGET, files)).toEqual(["image", "shape", "spelt"]);
  });
  it("resolves a page by the name its page.json gives, not its folder", () => {
    const at = (name: string, target: string) =>
      visual(
        "646039348818b651e02c",
        name,
        "actionButton",
        {},
        link({ type: lit("'PageNavigation'"), navigationSection: lit(`'${target}'`) }),
      );
    const files = [renamed, at("toName", "page_dashboard"), at("toFolder", "646039348818b651e02c")];
    expect(reportObjectIds(BROKEN_ACTION_TARGET, files)).toEqual(["toFolder"]);
  });
  it("sits on the line of the target property", () => {
    const text = pretty({
      name: "button",
      position: { x: 0, y: 0, z: 0, height: 40, width: 120, tabOrder: 0 },
      visual: {
        visualType: "actionButton",
        visualContainerObjects: {
          visualLink: [
            {
              properties: {
                show: lit("true"),
                type: lit("'PageNavigation'"),
                navigationSection: lit("'gone'"),
              },
            },
          ],
        },
      },
    });
    const line = lineOf(text, '"navigationSection"');
    expect(line).toBeGreaterThan(1);
    const file = "definition/pages/p/visuals/button/visual.json";
    const [f] = reportFindings(BROKEN_ACTION_TARGET, [page("p"), { path: file, text }]);
    expect(f).toMatchObject({ objectType: "Visual", objectId: "button", location: { file, line } });
    expect(f).toHaveProperty("object");
    expect(BROKEN_ACTION_TARGET).toMatchObject({
      ...tier3,
      name: "Action points at nothing",
      category: "Error Prevention",
      severity: 3,
      scope: ["Visual"],
    });
  });
});

describe("BROKEN_BOOKMARK_REFERENCE", () => {
  /** A bookmark as Desktop writes it, indented, so a finding's line can be read. */
  const bookmark = (
    name: string,
    explorationState: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => ({
    path: `definition/bookmarks/${name}.bookmark.json`,
    text: pretty({
      name,
      displayName: `Bookmark ${name}`,
      ...extra,
      explorationState: { version: "1.3", ...explorationState },
    }),
  });

  it("fires on a bookmark whose active page, captured page, or captured visual does not exist", () => {
    const files = [page("p"), visual("p", "v", "cardVisual"), ...bookmarks];
    expect(reportObjectIds(BROKEN_BOOKMARK_REFERENCE, files)).toEqual([]);
    const broken = bookmark("b2", {
      activeSection: "gone",
      sections: { p: { visualContainers: { missing: {} } }, other: {} },
    });
    const project = projectFrom([page("p"), broken]);
    const findings = BROKEN_BOOKMARK_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    expect(findings.map((f) => [f.detail, f.location!.line])).toEqual([
      ['active page "gone" does not exist', lineOf(broken.text, '"activeSection"')],
      ['captured page "other" does not exist', lineOf(broken.text, '"other"')],
      ['captured visual "missing" is not on page "Page p"', lineOf(broken.text, '"missing"')],
    ]);
  });
  it("reports a missing page once when it is the active page and the only section, as Desktop writes it", () => {
    const b = bookmark("b3", {
      activeSection: "gone",
      sections: { gone: { visualContainers: { v: {} } } },
    });
    const findings = reportFindings(BROKEN_BOOKMARK_REFERENCE, [page("p"), b]);
    expect(findings.map((f) => [f.objectId, f.detail, f.location!.line])).toEqual([
      ["b3", 'active page "gone" does not exist', lineOf(b.text, '"activeSection"')],
    ]);
  });
  it("points at a captured visual whose name holds a slash", () => {
    const b = bookmark("b4", {
      activeSection: "p",
      sections: { p: { visualContainers: { v: {}, "a/b": {} } } },
    });
    const findings = reportFindings(BROKEN_BOOKMARK_REFERENCE, [
      page("p"),
      visual("p", "v", "cardVisual"),
      b,
    ]);
    expect(findings.map((f) => [f.detail, f.location!.line])).toEqual([
      ['captured visual "a/b" is not on page "Page p"', lineOf(b.text, '"a/b"')],
    ]);
  });
  it("matches pages by name and reads neither captured groups nor target visual names", () => {
    const b = bookmark(
      "b5",
      {
        activeSection: "page_dashboard",
        sections: {
          page_dashboard: {
            visualContainers: { v: {} },
            visualContainerGroups: { goneGroup: { isHidden: true } },
          },
        },
      },
      { options: { applyOnlyToTargetVisuals: true, targetVisualNames: ["goneVisual"] } },
    );
    const files = [renamed, visual("646039348818b651e02c", "v", "cardVisual"), b];
    expect(reportObjectIds(BROKEN_BOOKMARK_REFERENCE, files)).toEqual([]);
  });
  it("names the bookmark and carries nothing to ignore it by", () => {
    const [f] = reportFindings(BROKEN_BOOKMARK_REFERENCE, [
      page("p"),
      bookmark("b6", { activeSection: "gone", sections: { gone: {} } }),
    ]);
    expect(f).toMatchObject({
      objectType: "Bookmark",
      objectName: 'Bookmark "Bookmark b6"',
      objectId: "b6",
      location: { file: "definition/bookmarks/b6.bookmark.json" },
    });
    expect(f).not.toHaveProperty("object");
    expect(BROKEN_BOOKMARK_REFERENCE).toMatchObject({
      ...tier3,
      name: "Bookmark refers to a missing page or visual",
      category: "Error Prevention",
      severity: 2,
      scope: ["Bookmark"],
    });
  });
});

describe("TAB_ORDER_FOLLOWS_LAYOUT", () => {
  const at = (
    name: string,
    x: number,
    y: number,
    tabOrder: number | undefined,
    container: Record<string, unknown> = {},
  ) =>
    visual("p", name, "cardVisual", {
      position: {
        x,
        y,
        z: 0,
        width: 100,
        height: 50,
        ...(tabOrder === undefined ? {} : { tabOrder }),
      },
      ...container,
    });
  /** A group's container: no `visual`, its members naming it in `parentGroupName`. */
  const group = (
    name: string,
    displayName: string,
    x: number,
    y: number,
    // Left out of the JSON when undefined, as Desktop leaves it out.
    tabOrder: number | undefined,
    container: Record<string, unknown> = {},
  ) => ({
    path: `definition/pages/p/visuals/${name}/visual.json`,
    text: j({
      name,
      position: { x, y, z: 0, width: 400, height: 200, tabOrder },
      visualGroup: { displayName, groupMode: "ScaleMode" },
      ...container,
    }),
  });
  const detail = (files: { path: string; text: string }[]) =>
    reportFindings(TAB_ORDER_FOLLOWS_LAYOUT, files).map((f) => [f.objectId, f.detail]);

  it("fires when the tab order disagrees with top-to-bottom, left-to-right reading order", () => {
    expect(
      reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [
        page("p"),
        at("a", 0, 0, 3000),
        at("b", 200, 5, 2000),
        at("c", 0, 200, 1000),
      ]),
    ).toEqual(["p"]);
    expect(
      reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [
        page("p"),
        at("a", 0, 0, 1000),
        at("b", 200, 5, 2000),
        at("c", 0, 200, 3000),
      ]),
    ).toEqual([]);
    // Within half the median height, a row is a row: b sits a little lower than a and still reads after it.
    expect(
      reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [
        page("p"),
        at("a", 0, 0, 1000),
        at("b", 200, 20, 2000),
      ]),
    ).toEqual([]);
    expect(reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [page("p"), at("only", 0, 0, 1000)])).toEqual(
      [],
    );
  });
  it("says which two visuals disagree first", () => {
    const project = projectFrom([
      page("p"),
      at("a", 0, 0, 3000),
      at("b", 200, 5, 2000),
      at("c", 0, 200, 1000),
    ]);
    const [f] = TAB_ORDER_FOLLOWS_LAYOUT.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    expect(f!.detail).toBe(
      "tab order starts at cardVisual (c) but the layout reads cardVisual (a) first",
    );
    // Past the first stop, the finding names the stop where the two part.
    expect(
      detail([page("p"), at("a", 0, 0, 1000), at("b", 200, 0, 3000), at("c", 400, 0, 2000)]),
    ).toEqual([["p", "tab order visits cardVisual (c) where the layout reads cardVisual (b)"]]);
  });
  it("reads a group's children in their own scope, where tab order restarts at 0", () => {
    const files = [
      page("p"),
      group("g", "Filters", 0, 0, 0),
      at("k", 500, 0, 1000),
      at("s1", 0, 0, 0, { parentGroupName: "g" }),
      at("s2", 0, 60, 1000, { parentGroupName: "g" }),
    ];
    expect(detail(files)).toEqual([]);
    const disagreeing = [
      page("p"),
      group("g", "Filters", 0, 0, 0),
      at("k", 500, 0, 1000),
      at("s1", 0, 0, 1000, { parentGroupName: "g" }),
      at("s2", 0, 60, 0, { parentGroupName: "g" }),
    ];
    expect(detail(disagreeing)).toEqual([
      [
        "p",
        'in Group "Filters", tab order starts at cardVisual (s2) but the layout reads cardVisual (s1) first',
      ],
    ]);
  });
  it("reports the first disagreement in tab sequence, a nested group's within its parent's", () => {
    const files = [
      page("p"),
      // The page's own members agree: outer, then later.
      group("outer", "Outer", 0, 0, 0),
      group("later", "Later", 0, 300, 1000),
      // Inside outer: the nested group, then a card, which agree; inside nested, two that do not.
      group("nested", "Nested", 0, 0, 0, { parentGroupName: "outer" }),
      at("o1", 0, 250, 1000, { parentGroupName: "outer" }),
      at("n1", 0, 0, 1000, { parentGroupName: "nested" }),
      at("n2", 0, 100, 0, { parentGroupName: "nested" }),
      // Inside later, two that also disagree, but later comes after outer in tab order.
      at("l1", 0, 0, 1000, { parentGroupName: "later" }),
      at("l2", 0, 100, 0, { parentGroupName: "later" }),
    ];
    expect(detail(files)).toEqual([
      [
        "p",
        'in Group "Nested", tab order starts at cardVisual (n2) but the layout reads cardVisual (n1) first',
      ],
    ]);
  });
  it("leaves out a visual hidden from the tab order and one whose place is not recorded", () => {
    // b's negative tabOrder is how Desktop writes a visual hidden from the tab order; c records
    // none. Either would read first if it were compared.
    const files = [
      page("p"),
      at("a", 0, 0, 1000),
      at("b", 200, 0, -1),
      at("c", 0, 200, undefined),
      at("d", 0, 400, 2000),
    ];
    expect(detail(files)).toEqual([]);
  });
  it("compares the children of a group that has no place in the tab order", () => {
    // The group records no tabOrder, or a negative one, so it takes no place among the page's
    // members; its children still have an order of their own.
    const grouped = (tabOrder: number | undefined) => [
      page("p"),
      group("g", "Filters", 0, 0, tabOrder),
      at("k", 500, 0, 1000),
      at("s1", 0, 0, 1000, { parentGroupName: "g" }),
      at("s2", 0, 60, 0, { parentGroupName: "g" }),
    ];
    const fired = [
      "p",
      'in Group "Filters", tab order starts at cardVisual (s2) but the layout reads cardVisual (s1) first',
    ];
    expect(detail(grouped(undefined))).toEqual([fired]);
    expect(detail(grouped(-1))).toEqual([fired]);
  });
  it("visits the groups the tab sequence reaches before those it does not", () => {
    const files = [
      page("p"),
      // Unreached, and first in reading order; its children disagree.
      group("unplaced", "Unplaced", 0, 0, undefined),
      at("u1", 0, 0, 1000, { parentGroupName: "unplaced" }),
      at("u2", 0, 100, 0, { parentGroupName: "unplaced" }),
      // Reached, below it on the page; its children disagree too, and are reported first.
      group("placed", "Placed", 0, 300, 0),
      at("k", 500, 300, 1000),
      at("p1", 0, 0, 1000, { parentGroupName: "placed" }),
      at("p2", 0, 100, 0, { parentGroupName: "placed" }),
    ];
    expect(detail(files)).toEqual([
      [
        "p",
        'in Group "Placed", tab order starts at cardVisual (p2) but the layout reads cardVisual (p1) first',
      ],
    ]);
  });
  it("leaves out a hidden visual and the children of a hidden group", () => {
    const files = [
      page("p"),
      at("h", 0, 0, 3000, { isHidden: true }),
      at("a", 0, 200, 1000),
      at("b", 0, 400, 2000),
      group("g", "Hidden", 500, 0, 4000, { isHidden: true }),
      at("g1", 0, 0, 1000, { parentGroupName: "g" }),
      at("g2", 0, 100, 0, { parentGroupName: "g" }),
    ];
    expect(detail(files)).toEqual([]);
  });
  it("accepts the strict top-then-left order Desktop's match visual order button writes", () => {
    // One row to the tolerant reading, which reads b first; strictly by top, a is first.
    expect(detail([page("p"), at("a", 200, 0, 1000), at("b", 0, 20, 2000)])).toEqual([]);
  });
  it("takes a tie in tab order, or in position, for no disagreement", () => {
    expect(detail([page("p"), at("a", 0, 0, 1000), at("b", 200, 0, 1000)])).toEqual([]);
    expect(detail([page("p"), at("a", 0, 0, 1000), at("b", 0, 0, 2000)])).toEqual([]);
  });
  it("sits on line 1 of the page's page.json", () => {
    const [f] = reportFindings(TAB_ORDER_FOLLOWS_LAYOUT, [
      page("p"),
      at("a", 0, 0, 2000),
      at("b", 0, 200, 1000),
    ]);
    expect(f).toMatchObject({
      objectType: "Page",
      objectId: "p",
      location: { file: "definition/pages/p/page.json", line: 1 },
    });
    expect(f).toHaveProperty("object");
    expect(TAB_ORDER_FOLLOWS_LAYOUT).toMatchObject({
      ...tier3,
      name: "Tab order disagrees with the layout",
      category: "Accessibility",
      severity: 2,
      scope: ["Page"],
    });
  });
});

describe("SLICER_SELECTION_SAVED", () => {
  const category = column("Product", "Category");
  /** A saved selection as Desktop writes it: a filter whose Where selects Bikes. */
  const selecting = (where: unknown[]) => ({
    filter: {
      Version: 2,
      From: [{ Name: "p", Entity: "Product", Type: 0 }],
      Where: where,
    },
  });
  const bikes = [
    {
      Condition: {
        In: {
          Expressions: [
            { Column: { Expression: { SourceRef: { Source: "p" } }, Property: "Category" } },
          ],
          Values: [[{ Literal: { Value: "'Bikes'" } }]],
        },
      },
    },
  ];
  const slicer = (
    name: string,
    where: unknown[] | undefined,
    type = "slicer",
    container: Record<string, unknown> = {},
    objects: Record<string, unknown> = {},
  ) =>
    visual("p", name, type, container, {
      query: { queryState: { Values: { projections: [{ field: category }] } } },
      objects: {
        ...objects,
        ...(where === undefined ? {} : { general: [{ properties: { filter: selecting(where) } }] }),
      },
    });

  it("fires on a slicer with a saved selection, as info, and as a warning under the policy", () => {
    expect(
      reportObjectIds(SLICER_SELECTION_SAVED, [
        page("p"),
        slicer("saved", bikes),
        slicer("clear", undefined),
      ]),
    ).toEqual(["saved"]);
    expect(SLICER_SELECTION_SAVED.severity).toBe(1);
    expect(SLICER_SELECTION_SAVED.policySeverity!({ expect: "none" })).toBe(2);
    expect(SLICER_SELECTION_SAVED.policySeverity!({})).toBeUndefined();
  });
  it("reads the selection in the slicer's general filter, never a Filters pane filter", () => {
    const files = [
      page("p"),
      // A filterConfig entry on a slicer is a visual-level filter of the Filters pane.
      slicer("paneOnly", undefined, "slicer", {
        filterConfig: {
          filters: [
            { name: "f", field: category, type: "Categorical", filter: selecting(bikes).filter },
          ],
        },
      }),
      // An empty Where selects nothing.
      slicer("emptyWhere", []),
      // Select all writes no filter, even in inverted selection mode.
      slicer(
        "selectAll",
        undefined,
        "slicer",
        {},
        {
          data: [{ properties: { isInvertedSelectionMode: lit("true") } }],
        },
      ),
      // A selection in the second general entry still counts.
      visual(
        "p",
        "second",
        "slicer",
        {},
        {
          objects: {
            general: [
              { properties: { selfFilterEnabled: lit("true") } },
              { properties: { filter: selecting(bikes) } },
            ],
          },
        },
      ),
    ];
    expect(reportObjectIds(SLICER_SELECTION_SAVED, files)).toEqual(["second"]);
  });
  it("fires on every slicer type in Microsoft's catalog, hidden or not, and on no other visual", () => {
    const files = [
      page("p"),
      slicer("button", bikes, "advancedSlicerVisual"),
      slicer("filter", bikes, "filterSlicer"),
      slicer("hidden", bikes, "slicer", { isHidden: true }),
      slicer("input", bikes, "textSlicer"),
      slicer("list", bikes, "listSlicer"),
      // An AppSource slicer is a custom visual, not one of Microsoft's slicers.
      slicer("zChiclet", bikes, "ChicletSlicer1448559807354"),
      slicer("zTable", bikes, "tableEx"),
    ];
    expect(reportObjectIds(SLICER_SELECTION_SAVED, files)).toEqual([
      "button",
      "filter",
      "hidden",
      "input",
      "list",
    ]);
  });
  it("sits on the line of the selection's filter", () => {
    const file = slicer("saved", bikes);
    const text = pretty(JSON.parse(file.text));
    const line = lineOf(text, '"filter"');
    expect(line).toBeGreaterThan(1);
    const [f] = reportFindings(SLICER_SELECTION_SAVED, [page("p"), { ...file, text }]);
    expect(f).toMatchObject({
      objectType: "Visual",
      objectId: "saved",
      detail: "opens with this selection applied",
      location: { file: "definition/pages/p/visuals/saved/visual.json", line },
    });
    expect(f).toHaveProperty("object");
    expect(SLICER_SELECTION_SAVED).toMatchObject({
      ...tier3,
      name: "Slicer saved with a selection",
      category: "Report Design",
      severity: 1,
      scope: ["Visual"],
      options: [{ name: "expect", type: "string", values: ["none"] }],
    });
  });
});
