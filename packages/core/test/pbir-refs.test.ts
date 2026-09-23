import { describe, expect, it } from "vitest";
import { collectFieldRefs } from "../src/pbir/refs.js";

const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});

describe("collectFieldRefs", () => {
  it("finds a column, a measure, an aggregation, and a hierarchy level, each with its pointer", () => {
    const projections = [
      { field: column("Product", "Category") },
      {
        field: {
          Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Total Sales" },
        },
      },
      { field: { Aggregation: { Expression: column("Sales", "Amount"), Function: 0 } } },
      {
        field: {
          HierarchyLevel: {
            Expression: {
              Hierarchy: { Expression: { SourceRef: { Entity: "Date" } }, Hierarchy: "Calendar" },
            },
            Level: "Year",
          },
        },
      },
    ];
    expect(collectFieldRefs(projections, "/projections")).toEqual([
      { kind: "column", table: "Product", name: "Category", pointer: "/projections/0/field" },
      { kind: "measure", table: "Sales", name: "Total Sales", pointer: "/projections/1/field" },
      { kind: "aggregation", table: "Sales", name: "Amount", pointer: "/projections/2/field" },
      {
        kind: "hierarchyLevel",
        table: "Date",
        name: "Calendar",
        level: "Year",
        pointer: "/projections/3/field",
      },
    ]);
  });
  it("resolves a filter's From alias and keeps it scoped to the filter that declares it", () => {
    const filters = [
      {
        name: "f1",
        field: column("Date", "Year"),
        filter: {
          Version: 2,
          From: [{ Name: "d", Entity: "Date", Type: 0 }],
          Where: [
            {
              Condition: {
                In: {
                  Expressions: [
                    { Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" } },
                  ],
                },
              },
            },
          ],
        },
      },
      {
        name: "f2",
        filter: {
          Where: [
            {
              Condition: {
                Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" },
              },
            },
          ],
        },
      },
    ];
    const refs = collectFieldRefs(filters, "/filters");
    expect(refs.map((r) => [r.table, r.name, r.pointer])).toEqual([
      ["Date", "Year", "/filters/0/field"],
      ["Date", "Year", "/filters/0/filter/Where/0/Condition/In/Expressions/0"],
      ["", "Year", "/filters/1/filter/Where/0/Condition"],
    ]);
  });
  it("lets a nested From shadow an outer alias even when its Entity is not a string", () => {
    const refs = collectFieldRefs({
      From: [{ Name: "d", Entity: "Outer", Type: 0 }],
      subquery: {
        From: [{ Name: "d", Expression: {} }],
        Where: [
          {
            Condition: {
              Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" },
            },
          },
        ],
      },
    });
    expect(refs.map((r) => [r.table, r.name])).toEqual([["", "Year"]]);
  });
  it("escapes a key with a slash in the pointer and ignores nodes that only look like references", () => {
    const refs = collectFieldRefs({ "a/b": [column("T", "C")], Column: "not a ref" }, "");
    expect(refs).toEqual([{ kind: "column", table: "T", name: "C", pointer: "/a~1b/0" }]);
  });
  it("reads Desktop's auto date/time hierarchy through its PropertyVariationSource", () => {
    // The shape Power BI Desktop writes when Auto date/time is on and a chart shows a date
    // column's Year: the hierarchy's source is the column's variation, not a table.
    const field = {
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
    expect(collectFieldRefs({ field }, "/p")).toEqual([
      {
        kind: "hierarchyLevel",
        table: "Sales",
        name: "Date Hierarchy",
        level: "Year",
        variation: { column: "OrderDate", name: "Variation" },
        pointer: "/p/field",
      },
    ]);
  });
  it("reads a variation source for a column, a measure, and an aggregation, through an alias too", () => {
    const variation = (source: unknown) => ({
      PropertyVariationSource: { Expression: source, Name: "Variation", Property: "OrderDate" },
    });
    const refs = collectFieldRefs({
      From: [{ Name: "s", Entity: "Sales", Type: 0 }],
      a: { Column: { Expression: variation({ SourceRef: { Source: "s" } }), Property: "Year" } },
      b: { Measure: { Expression: variation({ SourceRef: { Entity: "Sales" } }), Property: "M" } },
      c: {
        Aggregation: {
          Expression: {
            Column: { Expression: variation({ SourceRef: { Entity: "Sales" } }), Property: "Day" },
          },
          Function: 3,
        },
      },
    });
    const via = { column: "OrderDate", name: "Variation" };
    expect(refs).toEqual([
      { kind: "column", table: "Sales", name: "Year", variation: via, pointer: "/a" },
      { kind: "measure", table: "Sales", name: "M", variation: via, pointer: "/b" },
      { kind: "aggregation", table: "Sales", name: "Day", variation: via, pointer: "/c" },
    ]);
  });
  it("reads the schema a SourceRef names, or the From entry its alias names, and no other", () => {
    // Desktop writes `"Schema": "extension"` in every reference to a measure defined in the
    // report's reportExtensions.json; a reference to a model field names no schema.
    const extension = (source: Record<string, unknown>, property: string) => ({
      Measure: { Expression: { SourceRef: source }, Property: property },
    });
    const refs = collectFieldRefs({
      a: extension({ Schema: "extension", Entity: "Sales" }, "Net Margin"),
      b: {
        From: [{ Name: "s", Schema: "extension", Entity: "Sales", Type: 0 }],
        Where: [{ Condition: extension({ Source: "s" }, "Net Margin") }],
      },
      c: extension({ Entity: "Sales" }, "Total Sales"),
      d: extension({ Schema: "", Entity: "Sales" }, "Total Sales"),
      e: {
        Measure: {
          Expression: {
            PropertyVariationSource: {
              Expression: { SourceRef: { Schema: "extension", Entity: "Sales" } },
              Name: "Variation",
              Property: "OrderDate",
            },
          },
          Property: "M",
        },
      },
    });
    expect(refs.map((r) => [r.pointer, r.table, r.name, r.schema])).toEqual([
      ["/a", "Sales", "Net Margin", "extension"],
      ["/b/Where/0/Condition", "Sales", "Net Margin", "extension"],
      ["/c", "Sales", "Total Sales", undefined],
      ["/d", "Sales", "Total Sales", undefined],
      ["/e", "Sales", "M", "extension"],
    ]);
    // No schema named, no key at all, so every existing reference keeps its shape.
    expect(refs[2]).not.toHaveProperty("schema");
    expect(refs[3]).not.toHaveProperty("schema");
  });
  it("skips a TransformTableRef, which names a transform's output rather than a model table", () => {
    const transformed = { Expression: { TransformTableRef: { Source: "t" } }, Property: "X" };
    const refs = collectFieldRefs({
      a: { Column: transformed },
      b: { Measure: transformed },
      c: { Aggregation: { Expression: { Column: transformed }, Function: 0 } },
    });
    expect(refs).toEqual([]);
  });
  it("says why a reference has no table: an undeclared alias, an alias for no table, or no source", () => {
    const aliased = (source: string) => ({
      Column: { Expression: { SourceRef: { Source: source } }, Property: "Year" },
    });
    const refs = collectFieldRefs({
      From: [
        { Name: "sub", Expression: { Subquery: { Query: { From: [], Select: [] } } }, Type: 2 },
      ],
      a: aliased("d"),
      b: aliased("sub"),
      c: { Column: { Expression: { SourceRef: {} }, Property: "Year" } },
      d: { Column: { Expression: { Literal: { Value: "1L" } }, Property: "Year" } },
      e: { Column: { Property: "Year" } },
    });
    expect(refs.map((r) => [r.pointer, r.table, r.noTable])).toEqual([
      ["/a", "", "undeclaredAlias"],
      ["/b", "", "nonTableAlias"],
      ["/c", "", "noSource"],
      ["/d", "", "noSource"],
      ["/e", "", "noSource"],
    ]);
  });
});
