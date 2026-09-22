import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/pbi-inspector/counts.js";
import { bound, column, j, page, reportObjectIds, visual } from "./report-helpers.js";

const pages = (n: number) => Array.from({ length: n }, (_, i) => page(`p${i}`));
const many = (pageId: string, n: number, type = "cardVisual", container = {}) =>
  Array.from({ length: n }, (_, i) => visual(pageId, `${type}${i}`, type, container));

describe("REDUCE_VISUALS_ON_PAGE", () => {
  it("counts visible visuals that are not shapes, slicers, buttons, or text boxes, against max", () => {
    const over = [page("p"), ...many("p", 21)];
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, over)).toEqual(["p"]);
    const excluded = [
      page("p"),
      ...many("p", 20),
      ...many("p", 3, "slicer"),
      ...many("p", 3, "shape"),
      ...many("p", 3, "actionButton"),
      ...many("p", 3, "textbox"),
      visual("p", "hidden", "cardVisual", { isHidden: true }),
    ];
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, excluded)).toEqual([]);
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, over, undefined, { max: 25 })).toEqual([]);
    expect(
      reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, [page("p"), ...many("p", 3)], undefined, {
        max: 2,
      }),
    ).toEqual(["p"]);
  });
});

describe("REDUCE_OBJECTS_WITHIN_VISUALS", () => {
  it("counts the fields bound to a visual's roles once, against max", () => {
    const seven = Array.from({ length: 7 }, (_, i) => column("T", `C${i}`));
    const files = [
      page("p"),
      bound("p", "seven", "tableEx", seven),
      bound("p", "six", "tableEx", seven.slice(0, 6)),
    ];
    expect(reportObjectIds(rules.REDUCE_OBJECTS_WITHIN_VISUALS, files)).toEqual(["seven"]);
    expect(
      reportObjectIds(rules.REDUCE_OBJECTS_WITHIN_VISUALS, files, undefined, { max: 7 }),
    ).toEqual([]);
  });
});

describe("REDUCE_TOPN_FILTERS and REDUCE_ADVANCED_FILTERS", () => {
  const filtered = (pageId: string, n: number, type: string, applied: boolean) =>
    Array.from({ length: n }, (_, i) =>
      visual(pageId, `${type}${i}`, "cardVisual", {
        filterConfig: {
          filters: [
            {
              name: "f",
              field: column("T", "C"),
              type,
              ...(applied ? { filter: { Where: [] } } : {}),
            },
          ],
        },
      }),
    );
  it("counts visuals with a TopN filter, applied or not, against max", () => {
    expect(
      reportObjectIds(rules.REDUCE_TOPN_FILTERS, [page("p"), ...filtered("p", 5, "TopN", false)]),
    ).toEqual(["p"]);
    expect(
      reportObjectIds(rules.REDUCE_TOPN_FILTERS, [page("p"), ...filtered("p", 4, "TopN", true)]),
    ).toEqual([]);
  });
  it("counts only Advanced filters with a condition applied, which is the documented deviation", () => {
    expect(
      reportObjectIds(rules.REDUCE_ADVANCED_FILTERS, [
        page("p"),
        ...filtered("p", 5, "Advanced", true),
      ]),
    ).toEqual(["p"]);
    expect(
      reportObjectIds(rules.REDUCE_ADVANCED_FILTERS, [
        page("p"),
        ...filtered("p", 5, "Advanced", false),
      ]),
    ).toEqual([]);
  });
});

describe("REDUCE_PAGES", () => {
  it("fires on the report when there are more pages than max", () => {
    expect(
      reportObjectIds(rules.REDUCE_PAGES, [
        { path: "definition/report.json", text: j({}) },
        ...pages(11),
      ]),
    ).toEqual(["report"]);
    expect(reportObjectIds(rules.REDUCE_PAGES, pages(10))).toEqual([]);
    expect(reportObjectIds(rules.REDUCE_PAGES, pages(3), undefined, { max: 2 })).toEqual([
      "report",
    ]);
  });
});
