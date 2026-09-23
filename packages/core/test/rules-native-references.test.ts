import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import {
  BROKEN_FIELD_REFERENCE,
  NOT_REACHED_FROM_REPORT,
} from "../src/rules/pbiplint/references.js";
import { bound, column, j, measure, page, projectFrom, reportObjectIds } from "./report-helpers.js";

const tmdl = `table Sales
	column Amount
		dataType: decimal
	column Region
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Sales LY' = CALCULATE([Total Sales])
	measure 'Sales YoY %' = [Total Sales] - [Sales LY]
`;

/** The 1-based line of the first occurrence of `needle` in `text`. */
const lineOf = (text: string, needle: string): number =>
  text.slice(0, text.indexOf(needle)).split("\n").length;

describe("BROKEN_FIELD_REFERENCE", () => {
  it("names the object carrying each unresolved reference, with the field and the reason", () => {
    const files = [
      {
        path: "definition/report.json",
        text: j({
          filterConfig: {
            filters: [{ name: "rf", field: column("Nowhere", "X"), type: "Categorical" }],
          },
        }),
      },
      page("p", {
        filterConfig: {
          filters: [{ name: "pf", field: column("Sales", "Nope"), type: "Categorical" }],
        },
      }),
      bound("p", "v", "tableEx", [
        column("Sales", "Region"),
        measure("Sales", "Profit"),
        measure("Sales", "Net Margin"),
      ]),
      {
        path: "definition/bookmarks/b.bookmark.json",
        text: j({
          name: "b",
          displayName: "B",
          explorationState: {
            sections: { p: { filters: { byExpr: [{ expression: column("Sales", "Gone") }] } } },
          },
        }),
      },
      {
        path: "definition/reportExtensions.json",
        text: j({
          entities: [
            {
              name: "Sales",
              measures: [{ name: "Net Margin", expression: "[Total Sales] - [Missing]" }],
            },
          ],
        }),
      },
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    expect(findings.map((f) => [f.objectName, f.objectId, f.detail])).toEqual([
      ["Report filter", "report", `'Nowhere'[X]: no table named "Nowhere"`],
      ['Page filter on "Page p"', "p", `'Sales'[Nope]: no column named "Nope" on "Sales"`],
      ['tableEx (v) on "Page p"', "v", `[Profit]: no measure named "Profit" on "Sales"`],
      ['Bookmark "B"', "b", `'Sales'[Gone]: no column named "Gone" on "Sales"`],
    ]);
    expect(findings[2]!.location).toEqual({
      file: "definition/pages/p/visuals/v/visual.json",
      line: 1,
    });
  });
  it("is quiet when everything resolves, including a report measure", () => {
    const files = [page("p"), bound("p", "v", "cardVisual", [measure("Sales", "Total Sales")])];
    expect(reportObjectIds(BROKEN_FIELD_REFERENCE, files, tmdl)).toEqual([]);
  });
  it("points at the reference's own line in a pretty-printed report.json and bookmark", () => {
    const pretty = (v: unknown) => JSON.stringify(v, null, 2);
    const reportText = pretty({
      themeCollection: { baseTheme: { name: "CY24SU10" } },
      filterConfig: {
        filters: [{ name: "rf", field: column("Nowhere", "X"), type: "Categorical" }],
      },
    });
    const bookmarkText = pretty({
      name: "b",
      displayName: "B",
      explorationState: {
        activeSection: "p",
        sections: { p: { filters: { byExpr: [{ expression: column("Sales", "Gone") }] } } },
      },
    });
    const files = [
      { path: "definition/report.json", text: reportText },
      page("p"),
      { path: "definition/bookmarks/b.bookmark.json", text: bookmarkText },
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    const expected = [
      { file: "definition/report.json", line: lineOf(reportText, '"field"') },
      { file: "definition/bookmarks/b.bookmark.json", line: lineOf(bookmarkText, '"expression"') },
    ];
    expect(expected.every((l) => l.line > 1)).toBe(true);
    expect(findings.map((f) => f.location)).toEqual(expected);
  });
  it("labels a reference through an undeclared alias by its bare name", () => {
    const aliased = {
      Column: { Expression: { SourceRef: { Source: "s" } }, Property: "Region" },
    };
    const files = [
      page("p", {
        filterConfig: {
          filters: [
            {
              name: "pf",
              type: "Categorical",
              filter: { Where: [{ Condition: { In: { Expressions: [aliased] } } }] },
            },
          ],
        },
      }),
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    expect(findings.map((f) => f.detail)).toEqual([
      "[Region]: a filter alias that no From list declares",
    ]);
  });
});

describe("NOT_REACHED_FROM_REPORT", () => {
  it("lists unreached measures then columns, each with why", () => {
    const files = [page("p"), bound("p", "v", "cardVisual", [measure("Sales", "Total Sales")])];
    const project = projectFrom(files, tmdl);
    const findings = NOT_REACHED_FROM_REPORT.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    expect(findings.map((f) => [f.objectName, f.detail])).toEqual([
      ["[Sales LY]", "referenced only by [Sales YoY %], which nothing reaches either"],
      ["[Sales YoY %]", "nothing in the report reaches it, and no measure or column references it"],
      [
        "'Sales'[Region]",
        "nothing in the report reaches it, and no measure or column references it",
      ],
    ]);
  });
});
