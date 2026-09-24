import { describe, expect, it } from "vitest";
import { lint, type LintFile } from "../src/engine/lint.js";
import * as rules from "../src/rules/pbi-inspector/counts.js";
import {
  bound,
  column,
  j,
  measure,
  page,
  reportFindings,
  reportObjectIds,
  visual,
} from "./report-helpers.js";

const pages = (n: number) => Array.from({ length: n }, (_, i) => page(`p${i}`));
const many = (pageId: string, n: number, type = "cardVisual", container = {}) =>
  Array.from({ length: n }, (_, i) => visual(pageId, `${type}${i}`, type, container));

describe("REDUCE_VISUALS_ON_PAGE", () => {
  it("counts visuals without their own isHidden, other than shapes, slicers, buttons, and text boxes, against max", () => {
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

  it("gives the count and the threshold in the detail", () => {
    const files = [page("p"), ...many("p", 3)];
    expect(
      reportFindings(rules.REDUCE_VISUALS_ON_PAGE, files, undefined, { max: 2 }).map(
        (f) => f.detail,
      ),
    ).toEqual(["3 visuals, more than 2"]);
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

  // Projections as Desktop writes them: one entry per field in a well, with its query names.
  const entry = (field: unknown, queryRef: string) => ({
    field,
    queryRef,
    nativeQueryRef: queryRef.split(".").pop(),
  });
  const columns = (n: number) =>
    Array.from({ length: n }, (_, i) => entry(column("Product", `C${i}`), `Product.C${i}`));
  const wells = (name: string, queryState: Record<string, unknown>) =>
    visual("p", name, "tableEx", {}, { query: { queryState } });
  const details = (files: LintFile[], max?: number) =>
    lint([page("p"), ...files], {
      rules: [rules.REDUCE_OBJECTS_WITHIN_VISUALS],
      config: {
        failOn: "none",
        ...(max === undefined ? {} : { rules: { REDUCE_OBJECTS_WITHIN_VISUALS: { max } } }),
      },
    }).findings.map((f) => [f.objectId, f.detail]);

  it("counts one per projection entry, so a field bound in two roles counts twice", () => {
    const files = [
      wells("twice", {
        Rows: { projections: columns(4) },
        Values: { projections: [entry(measure("Sales", "Total Sales"), "Sales.Total Sales")] },
        Tooltips: {
          projections: [
            entry(measure("Sales", "Total Sales"), "Sales.Total Sales"),
            entry(measure("Sales", "Margin"), "Sales.Margin"),
          ],
        },
      }),
    ];
    expect(details(files)).toEqual([["twice", "7 fields bound, more than 6"]]);
  });

  it("counts a visual calculation as one, though it binds no model field", () => {
    const calc = entry(
      {
        NativeVisualCalculation: {
          Language: "dax",
          Expression: "RUNNINGSUM([C0])",
          Name: "Running total",
        },
      },
      "select",
    );
    const files = [wells("calc", { Values: { projections: [...columns(6), calc] } })];
    expect(details(files)).toEqual([["calc", "7 fields bound, more than 6"]]);
  });

  it("counts a sparkline as one, though it binds a measure and a grouping column", () => {
    const sparkline = entry(
      {
        SparklineData: {
          Measure: measure("Sales", "Total Sales"),
          Groupings: [column("Date", "Month")],
        },
      },
      "Sales.Total Sales by Month",
    );
    const files = [wells("spark", { Values: { projections: [...columns(5), sparkline] } })];
    expect(details(files)).toEqual([]);
    expect(details(files, 5)).toEqual([["spark", "6 fields bound, more than 5"]]);
  });

  it("counts an arithmetic projection as one, though each operand is a field", () => {
    const arithmetic = entry(
      {
        Arithmetic: {
          Left: measure("Sales", "Total Sales"),
          Right: measure("Sales", "Total Cost"),
          Operator: 1,
        },
      },
      "Sales.Total Sales - Sales.Total Cost",
    );
    const files = [wells("sum", { Values: { projections: [...columns(5), arithmetic] } })];
    expect(details(files)).toEqual([]);
    expect(details(files, 5)).toEqual([["sum", "6 fields bound, more than 5"]]);
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
