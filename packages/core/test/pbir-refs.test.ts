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

/**
 * A text box's field value as Power BI Desktop writes it in visual.json: an entry of
 * `visual.objects.values` whose `expr.expr` wraps a Column over a Subquery in `Min`
 * (`IncludeAllTypes` 1) or in an `Aggregation` (`Function` 3), beside a natural language
 * annotation, with the `selector` the text run names.
 */
const aliased = (alias: string, property: string) => ({
  Expression: { SourceRef: { Source: alias } },
  Property: property,
});
const overSubquery = (query: Record<string, unknown>, property: string) => ({
  Column: { Expression: { Subquery: { Query: query } }, Property: property },
});
const minOf = (value: unknown) => ({ Min: { Expression: value, IncludeAllTypes: 1 } });
const aggregationOf = (value: unknown) => ({ Aggregation: { Expression: value, Function: 3 } });
const textBox = (...values: [Record<string, unknown>, string][]) => ({
  name: "b1c2d3e4f5a6b7c8d9e0",
  visual: {
    visualType: "textbox",
    objects: {
      values: values.map(([expr, name]) => ({
        properties: {
          expr: {
            expr: {
              ...expr,
              Annotations: {
                NaturalLanguage: {
                  version: 1,
                  kind: "NaturalLanguage",
                  annotation: { name, utterance: name },
                },
              },
            },
          },
        },
        selector: { id: name },
      })),
    },
  },
});
/** The pointer of the query inside the first value's subquery, under the wrapper given. */
const inQuery = (wrapper: "Min" | "Aggregation", i = 0) =>
  `/visual/objects/values/${i}/properties/expr/expr/${wrapper}/Expression/Column/Expression/Subquery/Query`;
/** Form F1 and F2's query: one measure selected, named `<table>.<measure>`. */
const totalSales = {
  Version: 2,
  From: [{ Name: "s", Entity: "Sales", Type: 0 }],
  Select: [{ Measure: aliased("s", "Total Sales"), Name: "Sales.Total Sales" }],
};

describe("collectFieldRefs on a Column over a Subquery, a text box's field value", () => {
  it("collects the measure a Min-wrapped subquery selects, and nothing for the outer Column", () => {
    const refs = collectFieldRefs(
      textBox([minOf(overSubquery(totalSales, "Sales.Total Sales")), "Total Sales"]),
    );
    expect(refs).toEqual([
      {
        kind: "measure",
        table: "Sales",
        name: "Total Sales",
        pointer: `${inQuery("Min")}/Select/0`,
      },
    ]);
  });
  it("collects the measure an Aggregation-wrapped subquery selects, and nothing for the outer Column", () => {
    const refs = collectFieldRefs(
      textBox([aggregationOf(overSubquery(totalSales, "Sales.Total Sales")), "Value"]),
    );
    expect(refs).toEqual([
      {
        kind: "measure",
        table: "Sales",
        name: "Total Sales",
        pointer: `${inQuery("Aggregation")}/Select/0`,
      },
    ]);
  });
  it("collects a field once for each place the query's Select, Where, and OrderBy name it", () => {
    const query = {
      Version: 2,
      From: [{ Name: "c", Entity: "Customer", Type: 0 }],
      Select: [{ Column: aliased("c", "Customer Name"), Name: "Customer.Customer Name" }],
      Where: [
        {
          Condition: {
            Comparison: {
              ComparisonKind: 0,
              Left: { Column: aliased("c", "Region") },
              Right: { Literal: { Value: "'West'" } },
            },
          },
        },
      ],
      OrderBy: [{ Direction: 1, Expression: { Column: aliased("c", "Customer Name") } }],
    };
    const refs = collectFieldRefs(
      textBox([minOf(overSubquery(query, "Customer.Customer Name")), "Customer Name"]),
    );
    expect(refs.map((r) => [r.pointer, r.kind, r.table, r.name])).toEqual([
      [`${inQuery("Min")}/Select/0`, "column", "Customer", "Customer Name"],
      [`${inQuery("Min")}/Where/0/Condition/Comparison/Left`, "column", "Customer", "Region"],
      [`${inQuery("Min")}/OrderBy/0/Expression`, "column", "Customer", "Customer Name"],
    ]);
    expect(refs.some((r) => r.noTable !== undefined)).toBe(false);
  });
  it("collects the Select items the outer Property does not name", () => {
    const query = {
      Version: 2,
      From: [{ Name: "c", Entity: "Customer", Type: 0 }],
      Select: [
        { Column: aliased("c", "Customer Name"), Name: "Customer.Customer Name" },
        { Column: aliased("c", "Customer ID"), Name: "Customer.Customer ID" },
      ],
      OrderBy: [{ Direction: 1, Expression: { Column: aliased("c", "Customer Name") } }],
    };
    const refs = collectFieldRefs(
      textBox([minOf(overSubquery(query, "Customer.Customer Name")), "Customer Name"]),
    );
    expect(refs.map((r) => [r.pointer, r.table, r.name])).toEqual([
      [`${inQuery("Min")}/Select/0`, "Customer", "Customer Name"],
      [`${inQuery("Min")}/Select/1`, "Customer", "Customer ID"],
      [`${inQuery("Min")}/OrderBy/0/Expression`, "Customer", "Customer Name"],
    ]);
  });
  it("reads a TopN subquery nested in the query's From, whose own aliases shadow the query's", () => {
    // Form F10: the query's From declares `d` as Date and a TopN subquery whose own From declares
    // `d` again, as Sales. The query's Where compares against the subquery through In.Table.
    const query = {
      Version: 2,
      From: [
        { Name: "d", Entity: "Date", Type: 0 },
        {
          Name: "subquery",
          Expression: {
            Subquery: {
              Query: {
                Version: 2,
                From: [{ Name: "d", Entity: "Sales", Type: 0 }],
                Select: [{ Column: aliased("d", "Sale Date"), Name: "d_Sale_Date" }],
                OrderBy: [{ Direction: 2, Expression: { Column: aliased("d", "Sale Date") } }],
                Top: 1,
              },
            },
          },
          Type: 2,
        },
      ],
      Select: [{ Column: aliased("d", "Date"), Name: "Date.Date" }],
      Where: [
        {
          Condition: {
            In: {
              Expressions: [{ Column: aliased("d", "Date") }],
              Table: { SourceRef: { Source: "subquery" } },
            },
          },
        },
      ],
    };
    const refs = collectFieldRefs(textBox([minOf(overSubquery(query, "Date.Date")), "Date"]));
    const nested = `${inQuery("Min")}/From/1/Expression/Subquery/Query`;
    expect(refs.map((r) => [r.pointer, r.table, r.name, r.noTable])).toEqual([
      [`${nested}/Select/0`, "Sales", "Sale Date", undefined],
      [`${nested}/OrderBy/0/Expression`, "Sales", "Sale Date", undefined],
      [`${inQuery("Min")}/Select/0`, "Date", "Date", undefined],
      [`${inQuery("Min")}/Where/0/Condition/In/Expressions/0`, "Date", "Date", undefined],
    ]);
  });
  it("collects a Transform's inputs and none of the Select items over its output", () => {
    // Form F4: the query selects the columns of a KeyDriversSummary transform's output table,
    // which is not a model table; the model fields are the transform's input columns.
    const output = (property: string) => ({
      Column: {
        Expression: { TransformTableRef: { Source: "KeyDriversSummaryOutput" } },
        Property: property,
      },
      Name: property,
    });
    const input = (expression: Record<string, unknown>, name: string, role: string) => ({
      Expression: { ...expression, Name: name },
      Role: role,
    });
    const query = {
      Version: 2,
      From: [
        { Name: "s", Entity: "Sales", Type: 0 },
        { Name: "d", Entity: "Date", Type: 0 },
        { Name: "c", Entity: "Customer", Type: 0 },
      ],
      Select: [output("V1"), output("V2")],
      Transform: [
        {
          Name: "KeyDriversSummary",
          Algorithm: "KeyDriversSummary",
          Input: {
            Parameters: [{ Literal: { Value: "63000L" }, Name: "initialTemplateId" }],
            Table: {
              Name: "KeyDriversSummaryInput",
              Columns: [
                input({ Measure: aliased("s", "Total Sales") }, "d1", "AnalyzeColumnRole"),
                input({ Column: aliased("d", "Year") }, "d4_0", "ExplainByColumnRole"),
                input({ Column: aliased("c", "Segment") }, "d5_0", "ExpandByColumnRole"),
              ],
            },
          },
          Output: {
            Table: {
              Name: "KeyDriversSummaryOutput",
              Columns: [
                { Expression: { TransformOutputRoleRef: { Role: "V1" }, Name: "V1" }, Role: "V1" },
                { Expression: { TransformOutputRoleRef: { Role: "V2" }, Name: "V2" }, Role: "V2" },
              ],
            },
          },
        },
      ],
    };
    const refs = collectFieldRefs(textBox([minOf(overSubquery(query, "V2")), "V2"]));
    const columns = `${inQuery("Min")}/Transform/0/Input/Table/Columns`;
    expect(refs.map((r) => [r.pointer, r.kind, r.table, r.name])).toEqual([
      [`${columns}/0/Expression`, "measure", "Sales", "Total Sales"],
      [`${columns}/1/Expression`, "column", "Date", "Year"],
      [`${columns}/2/Expression`, "column", "Customer", "Segment"],
    ]);
  });
  it("still reads a Measure or a Hierarchy over a Subquery as a source that names no model table", () => {
    const refs = collectFieldRefs({
      a: {
        Measure: { Expression: { Subquery: { Query: totalSales } }, Property: "Sales.Total Sales" },
      },
      b: { Hierarchy: { Expression: { Subquery: { Query: totalSales } }, Hierarchy: "Calendar" } },
    });
    expect(refs).toEqual([
      { kind: "measure", table: "", name: "Sales.Total Sales", noTable: "noSource", pointer: "/a" },
      { kind: "hierarchyLevel", table: "", name: "Calendar", noTable: "noSource", pointer: "/b" },
    ]);
  });
  it("reads a TopN filter's subquery as before: its Select and OrderBy, and nothing for In.Table", () => {
    // The sample's Crowded-page cards carry this filter: the top product by Total Sales.
    const filter = {
      name: "f",
      field: {
        Column: { Expression: { SourceRef: { Entity: "Product" } }, Property: "Product Name" },
      },
      type: "TopN",
      filter: {
        Version: 2,
        From: [
          {
            Name: "subquery",
            Expression: {
              Subquery: {
                Query: {
                  Version: 2,
                  From: [
                    { Name: "p", Entity: "Product", Type: 0 },
                    { Name: "s", Entity: "Sales", Type: 0 },
                  ],
                  Select: [{ Column: aliased("p", "Product Name"), Name: "field" }],
                  OrderBy: [{ Direction: 2, Expression: { Measure: aliased("s", "Total Sales") } }],
                  Top: 5,
                },
              },
            },
            Type: 2,
          },
          { Name: "p", Entity: "Product", Type: 0 },
        ],
        Where: [
          {
            Condition: {
              In: {
                Expressions: [{ Column: aliased("p", "Product Name") }],
                Table: { SourceRef: { Source: "subquery" } },
              },
            },
          },
        ],
      },
      howCreated: "User",
    };
    const refs = collectFieldRefs(filter, "/filterConfig/filters/0");
    const at = "/filterConfig/filters/0";
    expect(refs.map((r) => [r.pointer, r.kind, r.table, r.name, r.noTable])).toEqual([
      [`${at}/field`, "column", "Product", "Product Name", undefined],
      [
        `${at}/filter/From/0/Expression/Subquery/Query/Select/0`,
        "column",
        "Product",
        "Product Name",
        undefined,
      ],
      [
        `${at}/filter/From/0/Expression/Subquery/Query/OrderBy/0/Expression`,
        "measure",
        "Sales",
        "Total Sales",
        undefined,
      ],
      [
        `${at}/filter/Where/0/Condition/In/Expressions/0`,
        "column",
        "Product",
        "Product Name",
        undefined,
      ],
    ]);
  });
});
