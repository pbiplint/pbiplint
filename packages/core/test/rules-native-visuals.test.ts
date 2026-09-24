import { describe, expect, it } from "vitest";
import type { LintFile } from "../src/engine/lint.js";
import { REDUCE_VISUALS_ON_PAGE } from "../src/rules/pbi-inspector/counts.js";
import { HIDDEN_VISUAL_WITH_FIELDS } from "../src/rules/pbiplint/visuals.js";
import {
  bound,
  column,
  j,
  lineOf,
  measure,
  page,
  pretty,
  reportFindings,
  reportObjectIds,
  visual,
} from "./report-helpers.js";

/**
 * A group's container on page p, as Power BI Desktop writes one: no `visual`, a `visualGroup`
 * with the display name when there is one, and `isHidden` when the Selection pane hides it.
 */
const group = (
  name: string,
  displayName: string | undefined,
  container: Record<string, unknown> = {},
): LintFile => ({
  path: `definition/pages/p/visuals/${name}/visual.json`,
  text: j({
    name,
    position: { x: 0, y: 0, z: 0, height: 300, width: 400, tabOrder: 0 },
    visualGroup: { ...(displayName === undefined ? {} : { displayName }), groupMode: "ScaleMode" },
    ...container,
  }),
});
/** A card on page p with one field bound, pretty-printed so a finding's line can be read. */
const card = (name: string, container: Record<string, unknown> = {}): LintFile => {
  const file = bound("p", name, "cardVisual", [column("Sales", "Amount")], container);
  return { ...file, text: pretty(JSON.parse(file.text)) };
};
const found = (files: LintFile[]) =>
  reportFindings(HIDDEN_VISUAL_WITH_FIELDS, files).map((f) => [
    f.objectId,
    f.location?.line,
    f.detail,
  ]);

describe("HIDDEN_VISUAL_WITH_FIELDS", () => {
  it("fires on a hidden visual with fields bound and not on an empty one", () => {
    const files = [
      page("p"),
      bound("p", "hiddenBound", "cardVisual", [column("Sales", "Amount")], { isHidden: true }),
      visual("p", "hiddenEmpty", "textbox", { isHidden: true }),
      bound("p", "shown", "cardVisual", [column("Sales", "Amount")]),
    ];
    expect(reportObjectIds(HIDDEN_VISUAL_WITH_FIELDS, files)).toEqual(["hiddenBound"]);
  });

  it("counts the entries in the visual's wells, not the field references they hold", () => {
    const wells = (name: string, queryState: Record<string, unknown>) =>
      visual("p", name, "tableEx", { isHidden: true }, { query: { queryState } });
    const files = [
      page("p"),
      // A visual calculation is a field in a well that references no model field.
      wells("calc", {
        Values: {
          projections: [
            {
              field: {
                NativeVisualCalculation: {
                  Language: "dax",
                  Expression: "RUNNINGSUM([C0])",
                  Name: "Running total",
                },
              },
            },
          ],
        },
      }),
      // An arithmetic projection is one field in a well, though each operand is a reference.
      wells("sum", {
        Values: {
          projections: [
            {
              field: {
                Arithmetic: {
                  Left: measure("Sales", "Total Sales"),
                  Right: measure("Sales", "Total Cost"),
                  Operator: 1,
                },
              },
            },
          ],
        },
      }),
      // One field bound in two roles is in two wells.
      wells("twice", {
        Category: { projections: [{ field: column("Sales", "Region") }] },
        Tooltips: { projections: [{ field: column("Sales", "Region") }] },
      }),
    ];
    expect(
      reportFindings(HIDDEN_VISUAL_WITH_FIELDS, files).map((f) => [f.objectId, f.detail]),
    ).toEqual([
      ["calc", "1 field bound"],
      ["sum", "1 field bound"],
      ["twice", "2 fields bound"],
    ]);
  });

  it("sits on the isHidden line of the visual's visual.json", () => {
    const file = bound("p", "hidden", "cardVisual", [column("Sales", "Amount")], {
      isHidden: true,
    });
    const text = JSON.stringify(JSON.parse(file.text), null, 2);
    const line = text.slice(0, text.indexOf('"isHidden"')).split("\n").length;
    expect(line).toBeGreaterThan(1);
    const [f] = reportFindings(HIDDEN_VISUAL_WITH_FIELDS, [page("p"), { ...file, text }]);
    expect(f).toMatchObject({
      objectType: "Visual",
      objectId: "hidden",
      location: { file: "definition/pages/p/visuals/hidden/visual.json", line },
      detail: "1 field bound",
    });
    expect(HIDDEN_VISUAL_WITH_FIELDS).toMatchObject({
      name: "Hidden visual with fields bound",
      category: "Maintenance",
      severity: 1,
      scope: ["Visual"],
      layer: "report",
      needs: ["report"],
      status: "builtin",
    });
  });

  it("fires on a visual hidden only through its group, at line 1, naming the group", () => {
    // Hiding a group in the Selection pane hides every visual in it, and Desktop does not always
    // write isHidden on those visuals themselves, so the visual has no isHidden line to point at.
    const files = [
      page("p"),
      group("g", "Filters", { isHidden: true }),
      card("child", { parentGroupName: "g" }),
      group("u", undefined, { isHidden: true }),
      card("inUnnamed", { parentGroupName: "u" }),
    ];
    expect(found(files)).toEqual([
      ["child", 1, '1 field bound, hidden with Group "Filters"'],
      ["inUnnamed", 1, "1 field bound, hidden with visualGroup (u)"],
    ]);
  });

  it("fires on a visual in a visible group inside a hidden one, naming the outermost hidden group", () => {
    const files = [
      page("p"),
      group("outer", "Header", { isHidden: true }),
      group("inner", "Statistics", { parentGroupName: "outer" }),
      card("grandchild", { parentGroupName: "inner" }),
      group("hiddenInner", "Tools", { parentGroupName: "outer", isHidden: true }),
      card("inBoth", { parentGroupName: "hiddenInner" }),
    ];
    expect(found(files)).toEqual([
      ["grandchild", 1, '1 field bound, hidden with Group "Header"'],
      ["inBoth", 1, '1 field bound, hidden with Group "Header"'],
    ]);
  });

  it("keeps a visual's own isHidden line and detail when its group is hidden too", () => {
    const own = card("own", { parentGroupName: "g", isHidden: true });
    const files = [page("p"), group("g", "Filters", { isHidden: true }), own];
    expect(found(files)).toEqual([["own", lineOf(own.text, '"isHidden"'), "1 field bound"]]);
    expect(lineOf(own.text, '"isHidden"')).toBeGreaterThan(1);
  });

  it("does not fire on a visual in a visible group, nor on a hidden group, which has no wells", () => {
    const files = [
      page("p"),
      group("g", "Filters"),
      card("child", { parentGroupName: "g" }),
      group("empty", "Empty", { isHidden: true }),
    ];
    expect(found(files)).toEqual([]);
  });

  it("follows a group on the visual's own page only, and only a group", () => {
    // parentGroupName names a container on the same page; a hidden group of that name on another
    // page, or a hidden visual that is not a group, does not hide the visual.
    const files = [
      page("p"),
      page("q"),
      {
        path: "definition/pages/q/visuals/g/visual.json",
        text: j({
          name: "g",
          position: {},
          visualGroup: { displayName: "Elsewhere" },
          isHidden: true,
        }),
      },
      card("orphan", { parentGroupName: "g" }),
      visual("p", "notGroup", "cardVisual", { isHidden: true }),
      card("underVisual", { parentGroupName: "notGroup" }),
    ];
    expect(found(files)).toEqual([]);
  });

  it("stops at a group that names itself as its parent, or a chain of groups that comes back round", () => {
    const files = [
      page("p"),
      group("self", "Self", { parentGroupName: "self" }),
      card("inSelf", { parentGroupName: "self" }),
      group("a", "A", { parentGroupName: "b" }),
      group("b", "B", { parentGroupName: "a" }),
      card("inA", { parentGroupName: "a" }),
      group("c", "C", { parentGroupName: "d" }),
      group("d", "D", { parentGroupName: "c", isHidden: true }),
      card("inC", { parentGroupName: "c" }),
      group("hiddenSelf", "Hidden self", { parentGroupName: "hiddenSelf", isHidden: true }),
      card("inHiddenSelf", { parentGroupName: "hiddenSelf" }),
    ];
    expect(found(files)).toEqual([
      ["inC", 1, '1 field bound, hidden with Group "D"'],
      ["inHiddenSelf", 1, '1 field bound, hidden with Group "Hidden self"'],
    ]);
  });

  it("leaves the ported REDUCE_VISUALS_ON_PAGE reading each visual's own isHidden, as its source does", () => {
    // PBI Inspector counts a visual without isHidden of its own, whatever its group; parity with it
    // depends on the port doing the same. The hidden group itself is not counted.
    const files = [
      page("p"),
      group("g", "Filters", { isHidden: true }),
      card("c1", { parentGroupName: "g" }),
      card("c2", { parentGroupName: "g" }),
    ];
    expect(
      reportFindings(REDUCE_VISUALS_ON_PAGE, files, undefined, { max: 1 }).map((f) => f.detail),
    ).toEqual(["2 visible visuals, more than 1"]);
  });
});
