import { describe, expect, it } from "vitest";
import {
  HIDE_TOOLTIP_DRILLTROUGH_PAGES,
  ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY,
} from "../src/rules/pbi-inspector/pages.js";
import { REMOVE_UNUSED_CUSTOM_VISUALS } from "../src/rules/pbi-inspector/report.js";
import { j, page, reportObjectIds, visual } from "./report-helpers.js";

describe("REMOVE_UNUSED_CUSTOM_VISUALS", () => {
  it("names each registered custom visual no visual uses", () => {
    const files = [
      {
        path: "definition/report.json",
        text: j({ publicCustomVisuals: ["ChicletSlicer1448559807354", "Used123"] }),
      },
      page("p"),
      visual("p", "v", "Used123"),
    ];
    expect(reportObjectIds(REMOVE_UNUSED_CUSTOM_VISUALS, files)).toEqual([
      "ChicletSlicer1448559807354",
    ]);
    expect(
      reportObjectIds(REMOVE_UNUSED_CUSTOM_VISUALS, [
        { path: "definition/report.json", text: j({}) },
        page("p"),
      ]),
    ).toEqual([]);
  });
});

describe("HIDE_TOOLTIP_DRILLTROUGH_PAGES", () => {
  it("fires on a tooltip or drillthrough page that readers can see", () => {
    const files = [
      page("tip", { pageBinding: { type: "Tooltip" } }),
      page("drill", { pageBinding: { type: "Drillthrough" }, visibility: "AlwaysVisible" }),
      page("hiddenTip", { pageBinding: { type: "Tooltip" }, visibility: "HiddenInViewMode" }),
      page("plain"),
    ];
    // With no pages.json to give an order, pages come out in id order.
    expect(reportObjectIds(HIDE_TOOLTIP_DRILLTROUGH_PAGES, files)).toEqual(["drill", "tip"]);
  });
});

describe("ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY", () => {
  it("fires on a visible page taller than maxHeight", () => {
    const files = [
      page("tall", { height: 721 }),
      page("ok", { height: 720 }),
      page("hiddenTall", { height: 2000, visibility: "HiddenInViewMode" }),
    ];
    expect(reportObjectIds(ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, files)).toEqual(["tall"]);
    expect(
      reportObjectIds(ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, files, undefined, { maxHeight: 1080 }),
    ).toEqual([]);
  });
});
