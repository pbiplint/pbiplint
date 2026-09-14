import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTmdl } from "../src/tmdl/parse.js";
import { unquoteName, unquoteValue } from "../src/tmdl/quote.js";

const specSample = readFileSync(
  new URL("../../../tests/fixtures/spec-sample.tmdl", import.meta.url),
  "utf8",
);

describe("quote helpers", () => {
  it("unquotes single-quoted names and doubled quotes", () => {
    expect(unquoteName("'O''Brien'")).toBe("O'Brien");
    expect(unquoteName("Plain")).toBe("Plain");
    expect(unquoteName("  'Net Price'  ")).toBe("Net Price");
  });
  it("unquotes double-quoted values and doubled quotes", () => {
    expect(unquoteValue('" My ""Amazing"" Measures"')).toBe(' My "Amazing" Measures');
    expect(unquoteValue("Long Date")).toBe("Long Date");
  });
});

describe("parseTmdl", () => {
  it("parses the spec sample with no issues", () => {
    const pf = parseTmdl("spec-sample.tmdl", specSample);
    expect(pf.issues).toEqual([]);
    expect(pf.roots.map((r) => `${r.kind}:${r.type}${r.name ? " " + r.name : ""}`)).toEqual([
      "object:database Sales",
      "object:model Model",
      "object:annotation PBI_QueryOrder",
      "object:table Sales",
      "object:table Sales",
      "object:table O'Brien",
      "object:relationship cdb6e6a9-c9d1-42b9-b9e0-484a1bc7e123",
      "object:role Role_Store1",
      "object:perspective Product",
      "object:expression Server",
      "object:expression Database",
      "object:cultureinfo en-US",
      "object:function Sales.Rate",
    ]);
  });

  it("attaches /// description lines to the next declaration", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    expect(sales.description).toBe("Table Description");
    const measure = sales.children.find((c) => c.type === "measure" && c.name === "Sales Amount")!;
    expect(measure.description).toBe("This is the Measure Description\nOne more line");
  });

  it("lowercases keys and reads flags, properties, and quoted values", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    const quantity = sales.children.find((c) => c.type === "column" && c.name === "Quantity")!;
    expect(quantity.props).toEqual({
      datatype: "int64",
      ishidden: true,
      isavailableinmdx: "false",
      sourcecolumn: "Quantity",
      summarizeby: "None",
    });
    const netPrice = sales.children.find((c) => c.name === "Net Price")!;
    expect(netPrice.props.sourcecolumn).toBe("Net Price");
    const measure = sales.children.find((c) => c.name === "Sales Amount")!;
    expect(measure.props.displayfolder).toBe(' My "Amazing" Measures');
    expect(measure.props.formatstring).toBe("$ #,##0");
  });

  it("reads inline, indented, and fenced expressions", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    const byName = (n: string) => sales.children.find((c) => c.name === n)!;
    expect(byName("Sales Amount").value).toBe("SUMX('Sales', [Quantity] * [Net Price])");
    expect(byName("Sales (ly)").value).toBe(
      "var ly = CALCULATE([Sales Amount], SAMEPERIODLASTYEAR('Calendar'[Date]))\nreturn ly",
    );
    expect(byName("Measure1").value).toBe("\tvar myVar = Today()\n\treturn myVar");
    const partition = byName("Sales-Partition");
    expect(partition.value).toBe("m");
    expect(partition.props.mode).toBe("import");
    expect(partition.props.source).toBe(
      "let\n\tSource = Sql.Database(Server, Database)\nin\n\tSource\n",
    );
  });

  it("uses the first block line to set expression indentation, like the TMDL reader", () => {
    const text = "table T\n\tmeasure Empty =\n\t\tlineageTag: abc\n\n\tmeasure Next = 1\n";
    const pf = parseTmdl("f.tmdl", text);
    const t = pf.roots[0]!;
    expect(t.children[0]!.value).toBe("lineageTag: abc");
    expect(t.children[0]!.props).toEqual({});
    expect(t.children[1]!.value).toBe("1");
  });

  it("parses calculation groups, hierarchies, roles, perspectives, cultures, and functions", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    const cg = sales.children.find((c) => c.type === "calculationgroup")!;
    expect(cg.kind).toBe("flag");
    expect(cg.props.precedence).toBe("1");
    expect(cg.children.filter((c) => c.type === "calculationitem").map((c) => c.name)).toEqual([
      "YTD",
      "Prior Year",
    ]);
    const prior = cg.children[2]!;
    expect(prior.value).toBe(
      "CALCULATE(\n\tSELECTEDMEASURE(),\n\tSAMEPERIODLASTYEAR('Calendar'[Date])\n)",
    );
    expect(prior.props.formatstringdefinition).toBe('"0.0%"');
    const hier = sales.children.find((c) => c.type === "hierarchy")!;
    expect(hier.children[0]!.type).toBe("level");
    expect(hier.children[0]!.props.column).toBe("Category");
    const role = pf.roots[7]!;
    expect(role.children[0]!.type).toBe("modelpermission");
    expect(role.children[1]!.type).toBe("tablepermission");
    expect(role.children[1]!.value).toBe("'Store'[Store Code] IN {1,10,20,30}");
    const culture = pf.roots[11]!;
    expect(culture.children[0]!.type).toBe("linguisticmetadata");
    expect(culture.children[0]!.value).toContain('"Version": "1.0.0"');
    expect(culture.children[0]!.props.contenttype).toBe("json");
    const fn = pf.roots[12]!;
    expect(fn.value).toBe("(x: INT64) => x * 2");
  });

  it("parses ref lines and CRLF input", () => {
    const pf = parseTmdl(
      "model.tmdl",
      "model Model\r\n\tculture: en-US\r\n\r\nref table Sales\r\nref cultureInfo en-US\r\n",
    );
    expect(pf.roots[1]).toMatchObject({ kind: "ref", type: "table", name: "Sales", line: 4 });
    expect(pf.roots[2]).toMatchObject({ kind: "ref", type: "cultureinfo", name: "en-US" });
  });

  it("ignores a leading UTF-8 BOM", () => {
    const pf = parseTmdl("f.tmdl", "﻿table T\n\tcolumn C\n\t\tdataType: string\n");
    expect(pf.issues).toEqual([]);
    expect(pf.roots[0]).toMatchObject({ kind: "object", type: "table", name: "T" });
  });

  it("parses a flag with children (query partition source)", () => {
    const text =
      "table Legacy\n\tpartition Legacy = query\n\t\tdataView: full\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Legacy\n\t\t\tdataSource: 'Legacy SQL'\n";
    const pf = parseTmdl("f.tmdl", text);
    const partition = pf.roots[0]!.children[0]!;
    expect(partition.value).toBe("query");
    const source = partition.children.find((c) => c.type === "source")!;
    expect(source.kind).toBe("flag");
    // Single-quoted references keep their quotes here; the object model unquotes names it knows.
    expect(source.props).toEqual({ query: "SELECT * FROM dbo.Legacy", datasource: "'Legacy SQL'" });
  });

  it("reports space indentation and unterminated fences as issues, not exceptions", () => {
    const pf = parseTmdl("bad.tmdl", "table T\n    column C\n\tmeasure M = ```\n\t\tx\n");
    expect(pf.issues.map((i) => [i.line, i.reason])).toEqual([
      [2, "space indentation (TMDL requires tabs)"],
      [3, "unterminated ``` fence"],
    ]);
  });

  it("reports orphan indentation", () => {
    const pf = parseTmdl("bad.tmdl", "\t\tcolumn C\n");
    expect(pf.issues[0]).toMatchObject({ line: 1, reason: "orphan indentation" });
  });

  it("records file, line, and indent on every node", () => {
    const pf = parseTmdl("tables/Sales.tmdl", "table Sales\n\n\tcolumn A\n\t\tdataType: int64\n");
    expect(pf.roots[0]).toMatchObject({ file: "tables/Sales.tmdl", line: 1, indent: 0 });
    expect(pf.roots[0]!.children[0]).toMatchObject({ line: 3, indent: 1 });
    expect(pf.roots[0]!.children[0]!.children[0]).toMatchObject({
      line: 4,
      indent: 2,
      kind: "prop",
    });
  });
});
