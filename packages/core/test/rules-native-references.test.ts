import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
