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
  it("escapes a key with a slash in the pointer and ignores nodes that only look like references", () => {
    const refs = collectFieldRefs({ "a/b": [column("T", "C")], Column: "not a ref" }, "");
    expect(refs).toEqual([{ kind: "column", table: "T", name: "C", pointer: "/a~1b/0" }]);
  });
});
