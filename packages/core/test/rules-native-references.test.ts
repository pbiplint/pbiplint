import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import { buildReport } from "../src/pbir/build.js";
import { PARSE_ISSUE } from "../src/rules/parse-issue.js";
import {
  BROKEN_FIELD_REFERENCE,
  NOT_REACHED_FROM_REPORT,
} from "../src/rules/pbiplint/references.js";
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
import { fixturesDir, parseModelDir } from "./helpers.js";

const tmdl = `table Sales
	column Amount
		dataType: decimal
	column Region
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Sales LY' = CALCULATE([Total Sales])
	measure 'Sales YoY %' = [Total Sales] - [Sales LY]
`;

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
    const files = [
      page("p"),
      bound("p", "v", "cardVisual", [
        measure("Sales", "Total Sales"),
        measure("Sales", "Net Margin"),
      ]),
      {
        path: "definition/reportExtensions.json",
        text: j({
          entities: [
            {
              name: "Sales",
              measures: [{ name: "Net Margin", expression: "[Total Sales] * 0.1" }],
            },
          ],
        }),
      },
    ];
    expect(reportObjectIds(BROKEN_FIELD_REFERENCE, files, tmdl)).toEqual([]);
  });
  it("reports a reference still naming the report's extension after its measure moved into the model", () => {
    // Desktop binds a report measure with `"Schema": "extension"`; the measure has since moved
    // into the model, and the input holds no reportExtensions.json, so nothing in the report
    // defines it.
    const text = pretty(
      JSON.parse(
        bound("p", "v", "cardVisual", [
          {
            Measure: {
              Expression: { SourceRef: { Schema: "extension", Entity: "Sales" } },
              Property: "Net Margin",
            },
          },
        ]).text,
      ),
    );
    const files = [page("p"), { path: "definition/pages/p/visuals/v/visual.json", text }];
    const withMeasure = `${tmdl}\tmeasure 'Net Margin' = [Total Sales] * 0.1\n`;
    expect(
      reportFindings(BROKEN_FIELD_REFERENCE, files, withMeasure).map((f) => [
        f.objectName,
        f.detail,
        f.location,
      ]),
    ).toEqual([
      [
        'cardVisual (v) on "Page p"',
        `[Net Margin]: no measure named "Net Margin" on "Sales": the report defines no extension measures`,
        { file: "definition/pages/p/visuals/v/visual.json", line: lineOf(text, '"field"') },
      ],
    ]);
  });
  it("leaves a reference naming the report's extension unreported while reportExtensions.json cannot be read", () => {
    // Both sides of the merge define Net Margin, and the model has one too. pbiplint reads neither
    // side, so it says nothing of what the file defines; PARSE_ISSUE names the file instead.
    const inExtension = {
      Measure: {
        Expression: { SourceRef: { Schema: "extension", Entity: "Sales" } },
        Property: "Net Margin",
      },
    };
    const side = (expression: string) =>
      j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression }] }] });
    const files = [
      page("p"),
      bound("p", "v1", "cardVisual", [inExtension]),
      bound("p", "v2", "cardVisual", [inExtension]),
      bound("p", "v3", "cardVisual", [inExtension]),
      {
        path: "definition/reportExtensions.json",
        text: [
          "<<<<<<< HEAD",
          side("[Total Sales] * 0.1"),
          "=======",
          side("[Total Sales] * 0.2"),
          ">>>>>>> main",
        ].join("\n"),
      },
    ];
    const withMeasure = `${tmdl}\tmeasure 'Net Margin' = [Total Sales] * 0.1\n`;
    expect(reportFindings(BROKEN_FIELD_REFERENCE, files, withMeasure)).toEqual([]);
    expect(
      reportFindings(PARSE_ISSUE, files, withMeasure).map((f) => [
        f.objectName,
        f.location?.line,
        f.detail,
      ]),
    ).toEqual([
      ["definition/reportExtensions.json", 1, "merge conflict marker: <<<<<<< HEAD"],
      ["definition/reportExtensions.json", 3, "merge conflict marker: ======="],
      ["definition/reportExtensions.json", 5, "merge conflict marker: >>>>>>> main"],
    ]);
  });
  it("leaves a reference naming the report's extension unreported while reportExtensions.json holds no object", () => {
    // `[]` is valid JSON, but not the object Microsoft's schema gives the file, so no measure is read
    // from it and nothing says what the extension defines. Neither does the model define Net Margin,
    // so a reference resolved against the model or an empty extension would be reported.
    const inExtension = {
      Measure: {
        Expression: { SourceRef: { Schema: "extension", Entity: "Sales" } },
        Property: "Net Margin",
      },
    };
    const r = lint([
      { path: "definition/tables/Sales.tmdl", text: tmdl },
      page("p"),
      bound("p", "v", "cardVisual", [inExtension]),
      { path: "definition/reportExtensions.json", text: "[]" },
    ]);
    expect(r.project.report!.extensions).toBe("unread");
    expect(r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE")).toEqual([]);
    expect(
      r.findings
        .filter((f) => f.ruleId === "PARSE_ISSUE")
        .map((f) => [f.objectName, f.location, f.detail]),
    ).toEqual([
      [
        "definition/reportExtensions.json",
        { file: "definition/reportExtensions.json", line: 1 },
        "not a JSON object (the file holds an array): []",
      ],
    ]);
  });
  it("says nothing about a table a misspelt keyword took out of the model, which PARSE_ISSUE reports", () => {
    const r = lint([
      { path: "definition/tables/Sales.tmdl", text: tmdl.replace("table Sales", "tabel Sales") },
      page("p"),
      bound("p", "v", "tableEx", [column("Sales", "Amount"), measure("Sales", "Total Sales")]),
    ]);
    expect(r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE")).toEqual([]);
    expect(
      r.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => [f.location, f.detail]),
    ).toEqual([
      [
        { file: "definition/tables/Sales.tmdl", line: 1 },
        '"tabel" is not a type TMDL declares at the root of a file: tabel Sales',
      ],
    ]);
  });
  it("says nothing about a field missing from a table whose own file has a parse issue, and reports one on a table read in full", () => {
    // Sales loses Amount to a line indented with spaces, Returns loses a measure to an unterminated
    // code fence, and Stock loses a column to a line the parser does not recognize. Product's file is
    // clean, so its missing column is reported whatever the other files hold.
    const r = lint([
      {
        path: "definition/tables/Sales.tmdl",
        text: tmdl.replace("\tcolumn Amount", "    column Amount"),
      },
      {
        path: "definition/tables/Returns.tmdl",
        text: "table Returns\n\tmeasure Refunds = ```\n\t\t\t1\n\tmeasure 'Return Rate' = 0.1\n",
      },
      {
        path: "definition/tables/Stock.tmdl",
        text: "table Stock\n\t'On Hand'\n\tcolumn Warehouse\n\t\tdataType: string\n",
      },
      {
        path: "definition/tables/Product.tmdl",
        text: "table Product\n\tcolumn Category\n\t\tdataType: string\n",
      },
      page("p"),
      bound("p", "v", "tableEx", [
        column("Sales", "Amount"),
        measure("Returns", "Return Rate"),
        column("Stock", "On Hand"),
        column("Product", "Colour"),
      ]),
    ]);
    expect(
      r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE").map((f) => f.detail),
    ).toEqual([`'Product'[Colour]: no column named "Colour" on "Product"`]);
    expect(
      r.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => f.location?.file),
    ).toEqual([
      "definition/tables/Sales.tmdl",
      "definition/tables/Sales.tmdl",
      "definition/tables/Returns.tmdl",
      "definition/tables/Stock.tmdl",
    ]);
  });
  it("reports a missing table while the model's only parse issue is an orphaned description", () => {
    const r = lint([
      {
        path: "definition/tables/Sales.tmdl",
        text: tmdl.replace("\tcolumn Region", "\t/// Described\n\n\tcolumn Region"),
      },
      page("p"),
      bound("p", "v", "tableEx", [column("Store", "City")]),
    ]);
    expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toHaveLength(1);
    expect(
      r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE").map((f) => f.detail),
    ).toEqual([`'Store'[City]: no table named "Store"`]);
  });
  describe("a line at the root that took the declarations under it", () => {
    /** Sales with its second column followed by `line`, which lost its tabs, and two more fields. */
    const salesWith = (line: string) =>
      [
        "table Sales",
        "\tcolumn Amount",
        "\t\tdataType: decimal",
        "\t\tsourceColumn: Amount",
        "",
        "\tcolumn Quantity",
        "\t\tdataType: int64",
        "\t\tsourceColumn: Quantity",
        "",
        line,
        "",
        "\tcolumn Region",
        "\t\tdataType: string",
        "\t\tsourceColumn: Region",
        "",
        "\tmeasure Total = SUM(Sales[Amount])",
        "",
      ].join("\n");
    const run = (text: string) => {
      const r = lint([
        { path: "definition/tables/Sales.tmdl", text },
        page("p"),
        bound("p", "v", "tableEx", [column("Sales", "Region"), measure("Sales", "Total")]),
      ]);
      return {
        parse: r.findings
          .filter((f) => f.ruleId === "PARSE_ISSUE")
          .map((f) => [f.location?.line, f.detail]),
        broken: r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE"),
      };
    };

    it("is one PARSE_ISSUE, and no finding for the fields under it, for a column's annotation", () => {
      expect(run(salesWith("annotation SummarizationSetBy = Automatic"))).toEqual({
        parse: [
          [
            10,
            '"annotation" at the root of a file has lines under it, which TMDL does not allow: annotation SummarizationSetBy = Automatic',
          ],
        ],
        broken: [],
      });
    });

    it("is one PARSE_ISSUE, and no finding for the fields under it, for a column's property", () => {
      expect(run(salesWith("summarizeBy: none"))).toEqual({
        parse: [
          [
            10,
            '"summarizeBy" is a property, which TMDL allows only under an object: summarizeBy: none',
          ],
        ],
        broken: [],
      });
    });
  });
  // TMDL lets a table's declaration sit in more than one file, such as one file for every table's
  // measures. Sales.tmdl is read in full; the measures file's own `table Sales` line is lost, so
  // its measure could be on Sales.
  it.each([
    ["misspelt", "tabel Sales", ['"tabel" is not a type TMDL declares at the root of a file']],
    [
      "indented with spaces",
      "  table Sales",
      ["space indentation (TMDL requires tabs)", "orphan indentation"],
    ],
  ])(
    "says nothing about a measure a second file held when that file's table line is %s",
    (_, tableLine, reasons) => {
      const r = lint([
        { path: "definition/tables/Sales.tmdl", text: "table Sales\n\tcolumn Amount\n" },
        {
          path: "definition/tables/measures.tmdl",
          text: `${tableLine}\n\tmeasure Total = SUM(Sales[Amount])\n`,
        },
        page("p"),
        bound("p", "v", "cardVisual", [measure("Sales", "Total")]),
      ]);
      expect(r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE")).toEqual([]);
      expect(
        r.findings
          .filter((f) => f.ruleId === "PARSE_ISSUE")
          .map((f) => [f.location?.file, f.detail?.split(":")[0]]),
      ).toEqual(reasons.map((reason) => ["definition/tables/measures.tmdl", reason]));
    },
  );
  // A lost-tab line at the root that cannot be a `table` line, nor take one with it, quiets only
  // the table its own file declares.
  it.each([
    ["a column's property", "summarizeBy: none", '"summarizeBy" is a property'],
    [
      "a column's annotation with lines under it",
      "annotation SummarizationSetBy = Automatic",
      '"annotation" at the root of a file has lines under it',
    ],
  ])(
    "still reports a field missing from a table read in full when another file has %s at its root",
    (_, line, reason) => {
      const r = lint([
        { path: "definition/tables/Sales.tmdl", text: "table Sales\n\tcolumn Amount\n" },
        {
          path: "definition/tables/Product.tmdl",
          text: `table Product\n\tcolumn Category\n${line}\n\tcolumn Colour\n`,
        },
        page("p"),
        bound("p", "v", "tableEx", [column("Sales", "Nope"), column("Product", "Colour")]),
      ]);
      expect(
        r.findings.filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE").map((f) => f.detail),
      ).toEqual([`'Sales'[Nope]: no column named "Nope" on "Sales"`]);
      expect(
        r.findings
          .filter((f) => f.ruleId === "PARSE_ISSUE")
          .map((f) => [f.location?.file, f.detail?.startsWith(reason)]),
      ).toEqual([["definition/tables/Product.tmdl", true]]);
    },
  );
  it("keeps one finding per file when two pages share a display name and a visual id", () => {
    const files = [
      page("p1", { displayName: "Same" }),
      page("p2", { displayName: "Same" }),
      bound("p1", "v", "tableEx", [measure("Sales", "Profit")]),
      bound("p2", "v", "tableEx", [measure("Sales", "Profit")]),
    ];
    const findings = reportFindings(BROKEN_FIELD_REFERENCE, files, tmdl);
    expect(findings.map((f) => [f.objectName, f.detail, f.location?.file])).toEqual([
      [
        'tableEx (v) on "Same"',
        '[Profit]: no measure named "Profit" on "Sales"',
        "definition/pages/p1/visuals/v/visual.json",
      ],
      [
        'tableEx (v) on "Same"',
        '[Profit]: no measure named "Profit" on "Sales"',
        "definition/pages/p2/visuals/v/visual.json",
      ],
    ]);
  });
  it("reports a drillthrough page whose binding names a missing column, on the page", () => {
    const files = [
      page("drill", {
        pageBinding: {
          name: "Pod",
          type: "Drillthrough",
          parameters: [
            {
              name: "Param_Filter1",
              boundFilter: "Filter1",
              fieldExpr: column("Sales", "Customer"),
            },
          ],
        },
      }),
    ];
    const findings = reportFindings(BROKEN_FIELD_REFERENCE, files, tmdl);
    expect(findings.map((f) => [f.objectName, f.objectId, f.detail])).toEqual([
      ['Page "Page drill"', "drill", `'Sales'[Customer]: no column named "Customer" on "Sales"`],
    ]);
  });
  it("labels a user hierarchy's level with its table and hierarchy", () => {
    const dated = `table Date
	column Month
		dataType: string
	hierarchy Calendar
		level Month
			column: Month
`;
    const level = {
      HierarchyLevel: {
        Expression: {
          Hierarchy: { Expression: { SourceRef: { Entity: "Date" } }, Hierarchy: "Calendar" },
        },
        Level: "Year",
      },
    };
    const findings = reportFindings(
      BROKEN_FIELD_REFERENCE,
      [page("p"), bound("p", "v", "tableEx", [level])],
      dated,
    );
    expect(findings.map((f) => f.detail)).toEqual([
      `'Date'[Calendar].[Year]: no level named "Year" in hierarchy "Calendar" on "Date"`,
    ]);
  });
  it("points at the reference's own line in a pretty-printed report.json and bookmark", () => {
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
  it("reports one finding for a missing column an applied page filter names twice", () => {
    const pageText = pretty({
      name: "p",
      displayName: "Page p",
      filterConfig: {
        filters: [
          {
            name: "pf",
            field: column("Sales", "Nope"),
            type: "Categorical",
            filter: {
              Version: 2,
              From: [{ Name: "s", Entity: "Sales", Type: 0 }],
              Where: [
                {
                  Condition: {
                    In: {
                      Expressions: [
                        {
                          Column: { Expression: { SourceRef: { Source: "s" } }, Property: "Nope" },
                        },
                      ],
                      Values: [[{ Literal: { Value: "'East'" } }]],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });
    const project = projectFrom([{ path: "definition/pages/p/page.json", text: pageText }], tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    expect(findings.map((f) => [f.objectName, f.detail, f.location])).toEqual([
      [
        'Page filter on "Page p"',
        `'Sales'[Nope]: no column named "Nope" on "Sales"`,
        { file: "definition/pages/p/page.json", line: lineOf(pageText, '"field"') },
      ],
    ]);
  });
  it("reports one finding for a missing column a visual binds and filters, on the binding's line", () => {
    const visualText = pretty({
      name: "v",
      position: { x: 0, y: 0, z: 0, height: 100, width: 100 },
      filterConfig: {
        filters: [{ name: "vf", field: column("Sales", "Nope"), type: "Categorical" }],
      },
      visual: {
        visualType: "tableEx",
        query: {
          queryState: { Values: { projections: [{ field: column("Sales", "Nope") }] } },
        },
      },
    });
    const files = [
      page("p"),
      { path: "definition/pages/p/visuals/v/visual.json", text: visualText },
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    const binding = lineOf(visualText, '"field"', visualText.indexOf('"projections"'));
    expect(binding).toBeGreaterThan(lineOf(visualText, '"field"'));
    expect(findings.map((f) => [f.objectId, f.detail, f.location])).toEqual([
      [
        "v",
        `'Sales'[Nope]: no column named "Nope" on "Sales"`,
        { file: "definition/pages/p/visuals/v/visual.json", line: binding },
      ],
    ]);
  });
  it("fires on a visual whose conditional formatting names a missing measure, at that line", () => {
    const visualText = pretty({
      name: "v",
      position: { x: 0, y: 0, z: 0, height: 100, width: 100 },
      visual: {
        visualType: "cardVisual",
        query: {
          queryState: { Data: { projections: [{ field: measure("Sales", "Total Sales") }] } },
        },
        objects: {
          labels: [
            { properties: { color: { solid: { color: { expr: measure("Sales", "Colour") } } } } },
          ],
        },
      },
    });
    const files = [
      page("p"),
      { path: "definition/pages/p/visuals/v/visual.json", text: visualText },
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    // The reference's pointer ends at the property's `expr`, so the finding sits on that line.
    const line = lineOf(visualText, '"expr"', visualText.indexOf('"objects"'));
    expect(line).toBeGreaterThan(lineOf(visualText, '"objects"'));
    expect(findings.map((f) => [f.objectId, f.detail, f.location])).toEqual([
      [
        "v",
        `[Colour]: no measure named "Colour" on "Sales"`,
        { file: "definition/pages/p/visuals/v/visual.json", line },
      ],
    ]);
  });
  it("folds a sort entry that repeats a missing bound field into the binding's finding", () => {
    const visualText = pretty({
      name: "v",
      position: { x: 0, y: 0, z: 0, height: 100, width: 100 },
      visual: {
        visualType: "tableEx",
        query: {
          queryState: { Values: { projections: [{ field: measure("Sales", "Profit") }] } },
          sortDefinition: {
            sort: [{ field: measure("Sales", "Profit"), direction: "Descending" }],
          },
        },
      },
    });
    const files = [
      page("p"),
      { path: "definition/pages/p/visuals/v/visual.json", text: visualText },
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, {
      indexes: buildIndexes(project),
      options: {},
    });
    const binding = lineOf(visualText, '"field"');
    expect(binding).toBeLessThan(lineOf(visualText, '"sortDefinition"'));
    expect(findings.map((f) => [f.objectId, f.detail, f.location])).toEqual([
      [
        "v",
        `[Profit]: no measure named "Profit" on "Sales"`,
        { file: "definition/pages/p/visuals/v/visual.json", line: binding },
      ],
    ]);
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
  it("names the hierarchy level behind a column the report does not reach", () => {
    const dated = `table Date
	column Year
		dataType: int64
	column Quarter
		dataType: string

	hierarchy 'Calendar Hierarchy'
		level Year
			column: Year
		level Quarter
			column: Quarter
`;
    const year = {
      HierarchyLevel: {
        Expression: {
          Hierarchy: {
            Expression: { SourceRef: { Entity: "Date" } },
            Hierarchy: "Calendar Hierarchy",
          },
        },
        Level: "Year",
      },
    };
    const findings = reportFindings(
      NOT_REACHED_FROM_REPORT,
      [page("p"), bound("p", "v", "tableEx", [year])],
      dated,
    );
    expect(findings.map((f) => [f.objectName, f.detail])).toEqual([
      [
        "'Date'[Quarter]",
        `nothing in the report reaches it, and no measure or column references it; level "Quarter" of hierarchy "Calendar Hierarchy" uses it`,
      ],
    ]);
  });
});

describe("a text box's field value, read through its subquery", () => {
  // Power BI Desktop writes a text box's field value as a Column over a Subquery, wrapped in `Min`
  // or in an `Aggregation`; the Column's Property names a column of the subquery's result.
  const model = `table Sales
	column 'Total Amount'
		dataType: decimal
	measure 'Total Sales' = SUM('Sales'[Total Amount])

table Customer
	column 'Customer Name'
		dataType: string
	column 'Customer ID'
		dataType: string

table Date
	column Date
		dataType: dateTime
`;
  const aliased = (alias: string, property: string) => ({
    Expression: { SourceRef: { Source: alias } },
    Property: property,
  });
  const overSubquery = (query: Record<string, unknown>, property: string) => ({
    Column: { Expression: { Subquery: { Query: query } }, Property: property },
  });
  const minOf = (value: unknown) => ({ Min: { Expression: value, IncludeAllTypes: 1 } });
  const aggregationOf = (value: unknown) => ({ Aggregation: { Expression: value, Function: 3 } });
  /** The text box's visual.json, its text runs showing each value, as Desktop indents it. */
  const textBox = (name: string, ...values: [Record<string, unknown>, string][]) => ({
    path: `definition/pages/p/visuals/${name}/visual.json`,
    text: pretty({
      name,
      position: { x: 20, y: 114, z: 5000, height: 54, width: 202, tabOrder: 5000 },
      visual: {
        visualType: "textbox",
        objects: {
          general: [
            {
              properties: {
                paragraphs: [
                  {
                    textRuns: values.map(([, id]) => ({
                      value: {
                        propertyIdentifier: { objectName: "values", propertyName: "expr" },
                        selector: { id },
                      },
                    })),
                  },
                ],
              },
            },
          ],
          values: values.map(([expr, id]) => ({
            properties: {
              expr: {
                expr: {
                  ...expr,
                  Annotations: {
                    NaturalLanguage: {
                      version: 1,
                      kind: "NaturalLanguage",
                      annotation: { name: id, utterance: id },
                    },
                  },
                },
              },
            },
            selector: { id },
          })),
        },
      },
    }),
  });
  const totalSales = minOf(
    overSubquery(
      {
        Version: 2,
        From: [{ Name: "s", Entity: "Sales", Type: 0 }],
        Select: [{ Measure: aliased("s", "Total Sales"), Name: "Sales.Total Sales" }],
      },
      "Sales.Total Sales",
    ),
  );

  it("raises no broken reference for a subquery that reads a model measure, and reaches the measure", () => {
    const files = [page("p"), textBox("t", [totalSales, "Total Sales"])];
    expect(reportFindings(BROKEN_FIELD_REFERENCE, files, model)).toEqual([]);
    expect(reportFindings(NOT_REACHED_FROM_REPORT, files, model).map((f) => f.objectName)).toEqual([
      "'Customer'[Customer Name]",
      "'Customer'[Customer ID]",
      "'Date'[Date]",
    ]);
  });
  it("reports a column the subquery reads and the model lacks once, at error, on the inner field's line", () => {
    // Form F3: the value is the latest Last Update, which Date does not have. The query names it in
    // its Select and again in its OrderBy; the rule reports it once, at the Select item.
    const lastUpdate = aggregationOf(
      overSubquery(
        {
          Version: 2,
          From: [{ Name: "d", Entity: "Date", Type: 0 }],
          Select: [{ Column: aliased("d", "Last Update"), Name: "Date.Last Update" }],
          OrderBy: [{ Direction: 1, Expression: { Column: aliased("d", "Last Update") } }],
        },
        "Date.Last Update",
      ),
    );
    const box = textBox("t", [lastUpdate, "Value"]);
    const r = lint([{ path: "definition/tables/Model.tmdl", text: model }, page("p"), box]);
    const select = lineOf(box.text, '"Select"') + 1;
    expect(select).toBeGreaterThan(lineOf(box.text, '"Subquery"'));
    expect(select).toBeLessThan(lineOf(box.text, '"Last Update"'));
    expect(r.groups.find((g) => g.rule.id === "BROKEN_FIELD_REFERENCE")?.rule.severity).toBe(3);
    expect(
      r.findings
        .filter((f) => f.ruleId === "BROKEN_FIELD_REFERENCE")
        .map((f) => [f.objectId, f.detail, f.location]),
    ).toEqual([
      [
        "t",
        `'Date'[Last Update]: no column named "Last Update" on "Date"`,
        { file: box.path, line: select },
      ],
    ]);
  });
  it("reaches a column that only a Select item the text box does not show names", () => {
    // Form F11: the query selects Customer ID beside the Customer Name the text box shows.
    const names = minOf(
      overSubquery(
        {
          Version: 2,
          From: [{ Name: "c", Entity: "Customer", Type: 0 }],
          Select: [
            { Column: aliased("c", "Customer Name"), Name: "Customer.Customer Name" },
            { Column: aliased("c", "Customer ID"), Name: "Customer.Customer ID" },
          ],
          OrderBy: [{ Direction: 1, Expression: { Column: aliased("c", "Customer Name") } }],
        },
        "Customer.Customer Name",
      ),
    );
    const files = [page("p"), textBox("t", [names, "Customer Name"])];
    expect(reportFindings(BROKEN_FIELD_REFERENCE, files, model)).toEqual([]);
    expect(reportFindings(NOT_REACHED_FROM_REPORT, files, model).map((f) => f.objectName)).toEqual([
      "[Total Sales]",
      "'Sales'[Total Amount]",
      "'Date'[Date]",
    ]);
  });
  it("lowers the Model fact's not-reached count by what the subquery reaches, as it shortens the rule's list", () => {
    // The fact's clause counts what the rule lists, so the two move together.
    const run = (...files: { path: string; text: string }[]) => {
      const r = lint([{ path: "definition/tables/Model.tmdl", text: model }, page("p"), ...files]);
      return {
        fact: r.facts.find((f) => f.label === "Model"),
        listed: r.findings
          .filter((f) => f.ruleId === "NOT_REACHED_FROM_REPORT")
          .map((f) => f.objectName),
      };
    };
    const before = run();
    expect(before.fact?.detail).toBe("4 columns and 1 measure not reached from this report");
    expect(before.listed).toEqual([
      "[Total Sales]",
      "'Sales'[Total Amount]",
      "'Customer'[Customer Name]",
      "'Customer'[Customer ID]",
      "'Date'[Date]",
    ]);
    // The text box reaches Total Sales, and Total Sales reaches Total Amount through its DAX.
    const after = run(textBox("t", [totalSales, "Total Sales"]));
    expect(after.fact).toEqual({
      layer: "model",
      label: "Model",
      value: "3 tables, 4 columns, 1 measure",
      detail: "3 columns and 0 measures not reached from this report",
      ruleId: "NOT_REACHED_FROM_REPORT",
    });
    expect(after.listed).toEqual([
      "'Customer'[Customer Name]",
      "'Customer'[Customer ID]",
      "'Date'[Date]",
    ]);
  });
});

describe("NOT_REACHED_FROM_REPORT and aggregation tables", () => {
  it("lists neither an aggregation table's columns nor the detail fields they map to", () => {
    // Report queries name the DirectQuery detail table, and Power BI answers them from the
    // imported aggregation table where it can, so no visual names Sales by Day.
    const aggregated = `table Sales
	column Amount
		dataType: decimal
	column 'Order Date'
		dataType: dateTime
	column Region
		dataType: string
	measure 'Order Count' = COUNTROWS('Sales')
	partition Sales = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse") in Source{[Item = "Sales"]}[Data]

table 'Sales by Day'
	isHidden

	column 'Order Date'
		dataType: dateTime

		alternateOf
			baseColumn: Sales.'Order Date'

	column Amount
		dataType: decimal

		alternateOf
			summarization: sum
			baseColumn: Sales.Amount

	column 'Order Count'
		dataType: int64

		alternateOf
			summarization: count
			baseTable: Sales

	partition 'Sales by Day' = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse") in Source{[Item = "vwSalesByDay"]}[Data]
`;
    const r = lint([
      { path: "definition/tables/Sales.tmdl", text: aggregated },
      page("p"),
      bound("p", "v", "cardVisual", [measure("Sales", "Order Count")]),
    ]);
    expect(
      r.findings.filter((f) => f.ruleId === "NOT_REACHED_FROM_REPORT").map((f) => f.objectName),
    ).toEqual(["'Sales'[Region]"]);
  });
});

describe("Desktop's auto date/time hierarchy, on tvw-baseline's model", () => {
  // tvw-baseline is a Desktop-saved model with Auto date/time on: Customer[Join Date] carries a
  // variation whose default hierarchy is on this local date table.
  const LDT = "LocalDateTable_1b2c1fde-0cf3-455e-bfee-a8e4970804e0";
  const model = buildModel(parseModelDir(`${fixturesDir}tvw-baseline.SemanticModel`));
  const joinDate = (level: string) => ({
    HierarchyLevel: {
      Expression: {
        Hierarchy: {
          Expression: {
            PropertyVariationSource: {
              Expression: { SourceRef: { Entity: "Customer" } },
              Name: "Variation",
              Property: "Join Date",
            },
          },
          Hierarchy: "Date Hierarchy",
        },
      },
      Level: level,
    },
  });
  const run = (...levels: string[]) => {
    const { report } = buildReport([
      page("p"),
      visual(
        "p",
        "v",
        "clusteredColumnChart",
        {},
        {
          query: {
            queryState: {
              Category: { projections: levels.map((l) => ({ field: joinDate(l) })) },
            },
          },
        },
      ),
    ]);
    const project = { model, report };
    const ctx = { indexes: buildIndexes(project), options: {} };
    return {
      broken: BROKEN_FIELD_REFERENCE.check(project, ctx),
      unreached: NOT_REACHED_FROM_REPORT.check(project, ctx),
      reach: ctx.indexes.reachability!,
    };
  };
  it("raises no broken reference for a chart on the date's Year and Quarter", () => {
    expect(run("Year", "Quarter").broken).toEqual([]);
  });
  it("reaches the levels the chart shows and what they need, and lists none of them", () => {
    const { unreached, reach } = run("Year", "Quarter");
    const names = unreached.map((f) => f.objectName);
    expect(names).not.toContain("'Customer'[Join Date]");
    // Desktop's auto date/time tables are left out of the list (ruling D42), reached or not.
    expect(
      names.filter((n) => n.startsWith("'LocalDateTable_") || n.startsWith("'DateTableTemplate_")),
    ).toEqual([]);
    const ldt = model.tables.find((t) => t.name === LDT)!;
    expect(ldt.columns.filter((c) => reach.reached(c)).map((c) => c.name)).toEqual([
      "Date",
      "Year",
      "MonthNo",
      "QuarterNo",
      "Quarter",
    ]);
  });
  it("names the date column and the hierarchy when a level is missing", () => {
    expect(run("Week").broken.map((f) => [f.objectId, f.detail])).toEqual([
      [
        "v",
        `'Customer'[Join Date].[Date Hierarchy].[Week]: no level named "Week" in hierarchy "Date Hierarchy" on "${LDT}"`,
      ],
    ]);
  });
});

describe("NOT_REACHED_FROM_REPORT and Desktop's auto date/time tables", () => {
  // A date column with Desktop's local date table behind its variation and the relationship
  // Desktop adds to it, beside the date table template, both as tvw-baseline carries them.
  const tables = `${fixturesDir}tvw-baseline.SemanticModel/definition/tables/`;
  const LDT = "LocalDateTable_1b2c1fde-0cf3-455e-bfee-a8e4970804e0";
  const localDateTable = readFileSync(`${tables}${LDT}.tmdl`, "utf8").replace(
    /Calendar\(.*\)/,
    "Calendar(MIN('Sales'[OrderDate]), MAX('Sales'[OrderDate]))",
  );
  const template = readFileSync(
    `${tables}DateTableTemplate_f2afc5fc-2d0d-478c-92e8-dc0f26f32175.tmdl`,
    "utf8",
  );
  const dated = `table Sales
	column Amount
		dataType: decimal
	column OrderDate
		dataType: dateTime

		variation Variation
			isDefault
			relationship: r1
			defaultHierarchy: ${LDT}.'Date Hierarchy'

	measure 'Total Sales' = SUM('Sales'[Amount])

${localDateTable}
${template}
relationship r1
	joinOnDateBehavior: datePartOnly
	fromColumn: Sales.OrderDate
	toColumn: ${LDT}.Date
`;
  const year = {
    HierarchyLevel: {
      Expression: {
        Hierarchy: {
          Expression: {
            PropertyVariationSource: {
              Expression: { SourceRef: { Entity: "Sales" } },
              Name: "Variation",
              Property: "OrderDate",
            },
          },
          Hierarchy: "Date Hierarchy",
        },
      },
      Level: "Year",
    },
  };
  const unreachedFor = (...fields: unknown[]) =>
    reportFindings(
      NOT_REACHED_FROM_REPORT,
      [page("p"), bound("p", "v", "tableEx", fields)],
      dated,
    ).map((f) => f.objectName);
  it("lists no auto date/time table's column, and reports the date column nothing uses", () => {
    // The relationship to the local date table is Desktop's, not a use of the date column.
    expect(unreachedFor(measure("Sales", "Total Sales"))).toEqual(["'Sales'[OrderDate]"]);
  });
  it("still reaches the level a visual binds through the variation, and the date column", () => {
    expect(unreachedFor(measure("Sales", "Total Sales"), year)).toEqual([]);
    const project = projectFrom(
      [page("p"), bound("p", "v", "tableEx", [measure("Sales", "Total Sales"), year])],
      dated,
    );
    const reach = buildIndexes(project).reachability!;
    const ldt = project.model!.tables.find((t) => t.name === LDT)!;
    expect(reach.reached(ldt.columns.find((c) => c.name === "Year")!)).toBe(true);
  });
});
