import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { HARDCODED_YEAR_IN_FILTER } from "../src/rules/pbiplint/filters.js";
import { j, lineOf, page, pretty, reportFindings, visual } from "./report-helpers.js";

const rule = HARDCODED_YEAR_IN_FILTER;
const literal = (value: string) => ({ Literal: { Value: value } });
/** A column read through the From alias `d`, as Desktop writes a filter's condition. */
const col = (property: string) => ({
  Column: { Expression: { SourceRef: { Source: "d" } }, Property: property },
});
const kept = (property: string, ...values: string[]) => ({
  In: { Expressions: [col(property)], Values: values.map((v) => [literal(v)]) },
});
const compare = (kind: number, left: unknown, right: unknown) => ({
  Comparison: { ComparisonKind: kind, Left: left, Right: right },
});
/** One Filters pane entry on Date, with its condition, as Desktop writes it. */
const entry = (condition: unknown, extra: Record<string, unknown> = {}, entity = "Date") => ({
  name: "f1",
  field: { Column: { Expression: { SourceRef: { Entity: entity } }, Property: "Year" } },
  type: "Categorical",
  filter: {
    Version: 2,
    From: [{ Name: "d", Entity: entity, Type: 0 }],
    Where: [{ Condition: condition }],
  },
  howCreated: "User",
  ...extra,
});
const filtered = (...entries: unknown[]) => ({ filterConfig: { filters: entries } });
const onPage = (condition: unknown, extra: Record<string, unknown> = {}) =>
  page("p", filtered(entry(condition, extra)));
const details = (files: Parameters<typeof reportFindings>[1]) =>
  reportFindings(rule, files).map((f) => f.detail);

describe("HARDCODED_YEAR_IN_FILTER", () => {
  it("is an info rule of pbiplint's own on the report layer", () => {
    expect(rule).toMatchObject({
      id: "HARDCODED_YEAR_IN_FILTER",
      name: "Hardcoded year in a filter",
      category: "Report Design",
      severity: 1,
      scope: ["Visual", "Page", "Report"],
      layer: "report",
      needs: ["report"],
      status: "builtin",
    });
  });

  it("fires on a filter on a visual, a page, and all pages that keeps one year", () => {
    const files = [
      { path: "definition/report.json", text: j(filtered(entry(kept("Year", "2024L")))) },
      page("p", filtered(entry(kept("Year", "2025L")))),
      visual("p", "v1", "card", filtered(entry(kept("Year", "2026L"))), {
        visualContainerObjects: { title: [{ properties: { text: { expr: literal("'Sales'") } } }] },
      }),
    ];
    expect(
      reportFindings(rule, files).map((f) => [f.objectType, f.objectName, f.objectId, f.detail]),
    ).toEqual([
      ["Report", "Report filter", "report", "fixed year 2024 on 'Date'[Year]"],
      ["Page", 'Page filter on "Page p"', "p", "fixed year 2025 on 'Date'[Year]"],
      ["Visual", '"Sales" on "Page p"', "v1", "fixed year 2026 on 'Date'[Year]"],
    ]);
  });

  it("names every year kept, once each, in the order written, as a list", () => {
    expect(details([onPage(kept("Year", "2024L", "2025L"))])).toEqual([
      "fixed years 2024 and 2025 on 'Date'[Year]",
    ]);
    expect(details([onPage(kept("Year", "2025L", "2025L", "2023L", "2024L"))])).toEqual([
      "fixed years 2025, 2023, and 2024 on 'Date'[Year]",
    ]);
    expect(details([onPage(kept("Year", "2021L", "2022L", "2023L", "2024L", "2025L"))])).toEqual([
      "fixed years 2021, 2022, 2023, and 2 more on 'Date'[Year]",
    ]);
  });

  it("reads a year written as text, Advanced filtering's is, and a blank beside the years", () => {
    expect(details([onPage(kept("Year", "'2025'"))])).toEqual(["fixed year 2025 on 'Date'[Year]"]);
    expect(details([onPage(compare(0, col("Year"), literal("2025L")))])).toEqual([
      "fixed year 2025 on 'Date'[Year]",
    ]);
    expect(details([onPage(kept("Year", "null", "2025L"))])).toEqual([
      "fixed year 2025 on 'Date'[Year]",
    ]);
  });

  it("reads year names in other languages, and a level of a hierarchy, the auto date/time one too", () => {
    expect(details([onPage(kept("Año", "2025L"))])).toEqual(["fixed year 2025 on 'Date'[Año]"]);
    expect(details([onPage(kept("FiscalYear", "2025L"))])).toEqual([
      "fixed year 2025 on 'Date'[FiscalYear]",
    ]);
    const level = (source: unknown) => ({
      HierarchyLevel: {
        Expression: { Hierarchy: { Expression: source, Hierarchy: "Calendar" } },
        Level: "Year",
      },
    });
    const userLevel = {
      In: { Expressions: [level({ SourceRef: { Source: "d" } })], Values: [[literal("2025L")]] },
    };
    expect(details([onPage(userLevel)])).toEqual(["fixed year 2025 on 'Date'[Calendar].[Year]"]);
    const autoLevel = {
      In: {
        Expressions: [
          {
            HierarchyLevel: {
              Expression: {
                Hierarchy: {
                  Expression: {
                    PropertyVariationSource: {
                      Expression: { SourceRef: { Source: "d" } },
                      Name: "Variation",
                      Property: "Order Date",
                    },
                  },
                  Hierarchy: "Date Hierarchy",
                },
              },
              Level: "Year",
            },
          },
        ],
        Values: [[literal("2025L")]],
      },
    };
    expect(details([page("p", filtered(entry(autoLevel, {}, "Sales")))])).toEqual([
      "fixed year 2025 on 'Sales'[Order Date].[Date Hierarchy].[Year]",
    ]);
  });

  it("fires on a filter hidden from readers or locked, and on one an Include made", () => {
    expect(
      details([
        page(
          "p",
          filtered(
            entry(kept("Year", "2025L"), { isHiddenInViewMode: true, isLockedInViewMode: true }),
            entry(kept("Year", "2024L"), { name: "f2", type: "Include", howCreated: "Include" }),
          ),
        ),
      ]),
    ).toEqual(["fixed year 2025 on 'Date'[Year]", "fixed year 2024 on 'Date'[Year]"]);
  });

  it("points at the line of the first year kept", () => {
    const text = pretty(filtered(entry(kept("Year", "2024L", "2025L"))));
    const [f] = reportFindings(rule, [{ path: "definition/report.json", text }]);
    expect(f!.location).toEqual({ file: "definition/report.json", line: lineOf(text, '"2024L"') });
  });

  it("stays silent on a filter that excludes years, starts from one, or moves with today", () => {
    const now = { DateSpan: { Expression: { Now: {} }, TimeUnit: 3 } };
    for (const condition of [
      { Not: { Expression: kept("Year", "2025L") } },
      { Not: { Expression: compare(0, col("Year"), literal("2025L")) } },
      compare(1, col("Year"), literal("2021L")),
      compare(2, col("Year"), literal("2021L")),
      compare(0, col("Date"), now),
      {
        Or: {
          Left: compare(0, col("Year"), literal("2024L")),
          Right: compare(0, col("Year"), literal("2025L")),
        },
      },
    ])
      expect(details([onPage(condition)]), j(condition)).toEqual([]);
  });

  it("stays silent on a column that holds no year, a year out of range, and a literal of another type", () => {
    for (const condition of [
      kept("Region", "'2025'"),
      kept("YearMonth", "202506L"),
      kept("Years of Service", "2025L"),
      kept("Date", "datetime'2025-01-01T00:00:00'"),
      kept("Year", "9999L"),
      kept("Year", "1949L"),
      kept("Year", "2050L"),
      kept("Year", "2025D"),
      kept("Year", "'FY2025'"),
    ])
      expect(details([onPage(condition)]), j(condition)).toEqual([]);
  });

  it("stays silent on a Top N filter, a card with no condition, and a filter drilling set", () => {
    const topN = {
      In: { Expressions: [col("Year")], Table: { SourceRef: { Source: "subquery" } } },
    };
    expect(details([onPage(topN, { type: "TopN" })])).toEqual([]);
    expect(
      details([
        page(
          "p",
          filtered({ name: "f", field: entry(kept("Year", "2025L")).field, type: "Categorical" }),
        ),
      ]),
    ).toEqual([]);
    expect(details([onPage(kept("Year", "2025L"), { howCreated: "Drillthrough" })])).toEqual([]);
    expect(details([onPage(kept("Year", "2025L"), { howCreated: "Drill" })])).toEqual([]);
  });

  it("leaves a filter alone when its page's name or its visual's title carries a year it keeps", () => {
    const titled = (title: string) => ({
      visualContainerObjects: {
        title: [{ properties: { text: { expr: literal(`'${title}'`) } } }],
      },
    });
    const files = [
      {
        path: "definition/pages/p/page.json",
        text: j({
          name: "p",
          displayName: "Sales 2025",
          ...filtered(entry(kept("Year", "2025L"))),
        }),
      },
      {
        path: "definition/pages/q/page.json",
        text: j({ name: "q", displayName: "Review FY25" }),
      },
      visual("q", "onQ", "card", filtered(entry(kept("Year", "2025L")))),
      { path: "definition/pages/r/page.json", text: j({ name: "r", displayName: "Overview" }) },
      visual("r", "named", "card", filtered(entry(kept("Year", "2024L"))), titled("Revenue 2024")),
      visual("r", "other", "card", filtered(entry(kept("Year", "2024L"))), titled("Revenue 2023")),
    ];
    expect(reportFindings(rule, files).map((f) => f.objectId)).toEqual(["other"]);
  });

  it("honours an ignore annotation on the page or the visual", () => {
    const ignore = { annotations: [{ name: "pbiplint.ignore", value: rule.id }] };
    const r = lint(
      [
        page("p", { ...filtered(entry(kept("Year", "2025L"))), ...ignore }),
        visual("p", "v1", "card", { ...filtered(entry(kept("Year", "2025L"))), ...ignore }),
        visual("p", "v2", "card", filtered(entry(kept("Year", "2025L")))),
      ],
      { rules: [rule] },
    );
    expect(r.findings.map((f) => f.objectId)).toEqual(["v2"]);
    expect(r.summary.ignored).toBe(2);
  });
});
