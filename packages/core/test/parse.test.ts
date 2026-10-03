import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTmdl } from "../src/tmdl/parse.js";
import { unquoteName, unquoteValue } from "../src/tmdl/quote.js";
import type { TmdlNode } from "../src/tmdl/types.js";

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

  it("drops a /// description that a blank line separates from its object, which Tabular Editor's reader rejects (checked 2026-09)", () => {
    const pf = parseTmdl(
      "t.tmdl",
      "table T\n\t/// Described\n\n\tcolumn A\n\t\tdataType: string\n",
    );
    const column = pf.roots[0]!.children.find((n) => n.kind === "object" && n.type === "column");
    expect(column?.description).toBeUndefined();
    expect(pf.issues).toEqual([
      {
        file: "t.tmdl",
        line: 2,
        text: "\t/// Described",
        reason: "description is not followed by a declaration",
        canDropObjects: false,
        canDropTableLine: false,
      },
    ]);
  });

  it("reports a run of /// lines at the line the run started on", () => {
    // The whole run is one description, so the issue points at where it begins rather than at the
    // last line before the gap.
    const pf = parseTmdl(
      "t.tmdl",
      "table T\n\t/// One\n\t/// Two\n\n\tcolumn A\n\t\tdataType: string\n",
    );
    expect(pf.issues).toEqual([
      {
        file: "t.tmdl",
        line: 2,
        text: "\t/// One",
        reason: "description is not followed by a declaration",
        canDropObjects: false,
        canDropTableLine: false,
      },
    ]);
  });

  it("reports a /// description at the end of a file, with or without a trailing newline", () => {
    const orphan = {
      file: "t.tmdl",
      line: 2,
      text: "\t/// Described",
      reason: "description is not followed by a declaration",
      canDropObjects: false,
      canDropTableLine: false,
    };
    expect(parseTmdl("t.tmdl", "table T\n\t/// Described\n").issues).toEqual([orphan]);
    // The same file without the final newline: nothing follows the description there either.
    expect(parseTmdl("t.tmdl", "table T\n\t/// Described").issues).toEqual([orphan]);
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
      [3, "unterminated code fence"],
    ]);
  });

  it("marks each issue by whether it can take an object out of the model, which only an orphaned description cannot", () => {
    // A rule that reports a missing object reads the mark, never the reason's words.
    const pf = parseTmdl(
      "bad.tmdl",
      [
        "table T",
        "\t/// Described",
        "",
        "    column Spaced",
        "\t'Unit Price'",
        "\t\t\t\tisHidden",
        "tabel Sales",
        "\tmeasure M = ```",
        "\t\tx",
      ].join("\n"),
    );
    expect(pf.issues.map((i) => [i.line, i.reason, i.canDropObjects])).toEqual([
      [2, "description is not followed by a declaration", false],
      [4, "space indentation (TMDL requires tabs)", true],
      [5, "unrecognized line", true],
      [6, "orphan indentation", true],
      [7, '"tabel" is not a type TMDL declares at the root of a file', true],
      [8, "unterminated code fence", true],
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

describe("root object types", () => {
  it("reports an object at the root whose type TMDL does not declare there, on its declaration line", () => {
    const pf = parseTmdl(
      "tables/Sales.tmdl",
      "table Product\n\tcolumn Key\n\t\tdataType: int64\n\ntabel Sales\n\tcolumn Amount\n\t\tdataType: decimal\n",
    );
    expect(pf.issues).toEqual([
      {
        file: "tables/Sales.tmdl",
        line: 5,
        text: "tabel Sales",
        reason: '"tabel" is not a type TMDL declares at the root of a file',
        canDropObjects: true,
        canDropTableLine: true,
      },
    ]);
  });

  it("compares the type without regard to case and names the word as written", () => {
    // TMDL reads keywords without regard to case, so `Table` is a table.
    expect(parseTmdl("t.tmdl", "Table Sales\n").issues).toEqual([]);
    expect(parseTmdl("t.tmdl", "Tabel Sales\n").issues.map((i) => i.reason)).toEqual([
      '"Tabel" is not a type TMDL declares at the root of a file',
    ]);
  });

  it("reports a word TMDL does not declare at the root, declared with a value or with no name", () => {
    const pf = parseTmdl(
      "t.tmdl",
      'expresion Server = "localhost"\n\ndatabse\n\tcompatibilityLevel: 1567\n',
    );
    expect(pf.issues.map((i) => [i.line, i.text, i.reason])).toEqual([
      [
        1,
        'expresion Server = "localhost"',
        '"expresion" is not a type TMDL declares at the root of a file',
      ],
      [3, "databse", '"databse" is not a type TMDL declares at the root of a file'],
    ]);
  });

  it("reports a child type or a property that lost its tab, which TMDL declares only under an object", () => {
    // The word is a TMDL word, so the reason says where it may stand rather than calling it unknown.
    const pf = parseTmdl(
      "tables/Sales.tmdl",
      "table Sales\n\tcolumn Key\n\t\tdataType: int64\n\ncolumn Amount\n\tdataType: decimal\nisHidden\n",
    );
    expect(pf.issues.map((i) => [i.line, i.text, i.reason])).toEqual([
      [5, "column Amount", '"column" is not a type TMDL declares at the root of a file'],
      [7, "isHidden", '"isHidden" is not a type TMDL declares at the root of a file'],
    ]);
  });

  it("reads every root type TMDL defines without an issue, whether the model holds it or not", () => {
    const text = [
      "database Sales",
      "\tcompatibilityLevel: 1567",
      "",
      "model Model",
      "\tculture: en-US",
      "",
      "queryGroup 'Fact Queries'",
      "",
      'annotation PBI_QueryOrder = ["Sales"]',
      "",
      "extendedProperty ParameterMetadata =",
      "\t\t{",
      '\t\t  "version": 1',
      "\t\t}",
      "",
      'bindingInfo \'{"kind":"AzureDataExplorer","path":"help"}\'',
      "\ttype: dataBindingHint",
      "",
      "ref table Sales",
      "",
      "table Sales",
      "\tcolumn Amount",
      "\t\tdataType: decimal",
      "",
      "relationship 0b6c2c56-8c9d-4d5f-9b1a-2f3f8a4c1e11",
      "\tfromColumn: Sales.Key",
      "\ttoColumn: Product.Key",
      "",
      "role Readers",
      "\tmodelPermission: read",
      "",
      "perspective Finance",
      "\tperspectiveTable Sales",
      "",
      "cultureInfo en-US",
      "",
      'expression Server = "localhost"',
      "",
      "function Double = (x: INT64) => x * 2",
      "",
      "dataSource 'Legacy SQL' = provider",
      "",
      "createOrReplace",
      "",
      "\ttable Product",
      "\t\tcolumn Key",
      "\t\t\tdataType: int64",
      "",
    ].join("\n");
    const pf = parseTmdl("t.tmdl", text);
    expect(pf.issues).toEqual([]);
    expect(pf.roots.filter((r) => r.kind !== "ref").map((r) => r.type)).toEqual([
      "database",
      "model",
      "querygroup",
      "annotation",
      "extendedproperty",
      "bindinginfo",
      "table",
      "relationship",
      "role",
      "perspective",
      "cultureinfo",
      "expression",
      "function",
      "datasource",
      "createorreplace",
    ]);
  });

  it("reports a declaration whose type its object does not allow, and keeps it out of the model (#144)", () => {
    // Microsoft's TMDL reader refuses this file: "Unsupported child - columm is not a supported...".
    const pf = parseTmdl(
      "t.tmdl",
      "table Sales\n\tcolumm Amount\n\t\tdataType: decimal\n\tcolumn Region\n\t\tdataType: string\n",
    );
    expect(pf.issues).toEqual([
      {
        file: "t.tmdl",
        line: 2,
        text: "\tcolumm Amount",
        reason: '"columm" is not a type TMDL declares under a table',
        canDropObjects: true,
        canDropTableLine: false,
      },
    ]);
    expect(pf.roots[0]!.children.map((c) => [c.type, c.name])).toEqual([["column", "Region"]]);
  });

  it("reports a level that lost its tab, and a measure with one tab too many", () => {
    const pf = parseTmdl(
      "t.tmdl",
      [
        "table Product",
        "\tcolumn Category",
        "\t\tdataType: string",
        "\t\tmeasure 'Item Count' = 1",
        "\thierarchy 'by Category'",
        "\t\tlevel Category",
        "\t\t\tcolumn: Category",
        "\tlevel Subcategory",
        "\t\tcolumn: Subcategory",
        "",
      ].join("\n"),
    );
    expect(pf.issues.map((i) => [i.line, i.reason])).toEqual([
      [4, '"measure" is not a type TMDL declares under a column'],
      [8, '"level" is not a type TMDL declares under a table'],
    ]);
    const hierarchy = pf.roots[0]!.children.find((c) => c.type === "hierarchy")!;
    expect(hierarchy.children.map((c) => c.name)).toEqual(["Category"]);
  });

  it("names both words as written, whatever their case", () => {
    const pf = parseTmdl("t.tmdl", "role Admins\n\tTablePermision Sales = TRUE()\n");
    expect(pf.issues.map((i) => i.reason)).toEqual([
      '"TablePermision" is not a type TMDL declares under a role',
    ]);
  });

  it("reads every child object type its object allows with no issue", () => {
    const text = [
      "table Sales",
      "\tcolumn Amount",
      "\t\tvariation Variation",
      "\t\t\tisDefault",
      "\t\t\tannotation A = 1",
      "\t\tannotation A = 1",
      "\t\textendedProperty E = {}",
      "\tmeasure Total = 1",
      "\t\tkpi",
      "\t\t\ttargetExpression = 1",
      "\t\t\tannotation A = 1",
      "\t\tannotation A = 1",
      "\thierarchy H",
      "\t\tlevel L",
      "\t\t\tcolumn: Amount",
      "\t\t\tannotation A = 1",
      "\tpartition Sales = m",
      "\t\tannotation A = 1",
      "\tcalendar Gregorian",
      "\tcalculationGroup",
      "\t\tcalculationItem YTD = SELECTEDMEASURE()",
      "\t\tannotation A = 1",
      "\tannotation A = 1",
      "\textendedProperty E = {}",
      "",
      "role Admins",
      "\tmember 'a@example.com'",
      "\t\tannotation A = 1",
      "\ttablePermission Sales = TRUE()",
      "\t\tcolumnPermission Amount = none",
      "\t\t\tannotation A = 1",
      "",
      "perspective View",
      "\tperspectiveTable Sales",
      "\t\tperspectiveColumn Amount",
      "\t\tperspectiveMeasure Total",
      "\t\tperspectiveHierarchy H",
      "\t\t\tannotation A = 1",
      "",
      "relationship R",
      "\tannotation A = 1",
      "expression P = 1",
      "\tannotation A = 1",
      "function F = () => 1",
      "\tannotation A = 1",
      "queryGroup G",
      "\tannotation A = 1",
      "",
    ].join("\n");
    expect(parseTmdl("t.tmdl", text).issues).toEqual([]);
  });

  it("refuses what Microsoft's reader refuses under a calculation item, a calendar, and a query group", () => {
    const pf = parseTmdl(
      "t.tmdl",
      [
        "table T",
        "\tcalendar Gregorian",
        "\t\tannotation A = 1",
        "\tcalculationGroup",
        "\t\tcalculationItem YTD = SELECTEDMEASURE()",
        "\t\t\tannotation A = 1",
        "\t\textendedProperty E = {}",
        "queryGroup G",
        "\textendedProperty E = {}",
        "",
      ].join("\n"),
    );
    expect(pf.issues.map((i) => [i.line, i.reason])).toEqual([
      [3, '"annotation" is not a type TMDL declares under a calendar'],
      [6, '"annotation" is not a type TMDL declares under a calculationItem'],
      [7, '"extendedProperty" is not a type TMDL declares under a calculationGroup'],
      [9, '"extendedProperty" is not a type TMDL declares under a queryGroup'],
    ]);
  });

  it("leaves unreported what Microsoft's reader refuses but the object model holds a collection of", () => {
    const pf = parseTmdl(
      "t.tmdl",
      [
        "table T",
        "\tset S",
        "\tchangedProperty IsHidden",
        "\tcalendar Gregorian",
        "\t\tcalendarColumnGroup Year",
        "\t\ttimeUnitColumnAssociation Month",
        "",
      ].join("\n"),
    );
    expect(pf.issues).toEqual([]);
  });

  it("keeps today's reading of flags, properties, and what sits under an object it does not list", () => {
    const pf = parseTmdl(
      "t.tmdl",
      [
        "table Sales",
        "\tcolumn Amount",
        "\t\tisHiden",
        "\t\tsumarizeBy: none",
        "\trefreshPolicy",
        "\t\tpolicyType: basic",
        "\t\tanything Goes",
        "",
      ].join("\n"),
    );
    expect(pf.issues).toEqual([]);
  });

  it("keeps today's reading inside a culture's translations and a TMDL script", () => {
    const pf = parseTmdl(
      "t.tmdl",
      [
        "cultureInfo de-DE",
        "\ttranslations",
        "\t\tmodel Model",
        "\t\t\ttable Sales",
        "\t\t\t\tcolumn Amount",
        "\t\t\t\t\ttranslatedCaption: Betrag",
        "createOrReplace",
        "\ttable Sales",
        "\t\tcolumn Amount",
        "\t\t\tsomething Odd",
        "",
      ].join("\n"),
    );
    expect(pf.issues).toEqual([]);
  });

  it("reports nothing again under a line it already reported", () => {
    const pf = parseTmdl("t.tmdl", "table Sales\n\tcolumm Amount\n\t\tvariationn V\n");
    expect(pf.issues.map((i) => i.line)).toEqual([2]);
  });

  it("keeps today's reading of ref lines at the root, and reports properties and expressions there", () => {
    // `ref table` with no name misses the ref form and reads as a declaration of type `ref`.
    const pf = parseTmdl("t.tmdl", "ref tabel Sales\nref table\nculture: en-US\nsource = 1\n");
    expect(pf.issues.map((i) => [i.line, i.text, i.reason])).toEqual([
      [3, "culture: en-US", '"culture" is a property, which TMDL allows only under an object'],
      [4, "source = 1", '"source" is a property, which TMDL allows only under an object'],
    ]);
    expect(pf.roots.map((r) => [r.kind, r.type])).toEqual([
      ["ref", "tabel"],
      ["object", "ref"],
      ["prop", "culture"],
      ["expr", "source"],
    ]);
  });
});

describe("properties at the root, and lines under a root annotation or extended property", () => {
  const PROPERTY = (word: string) =>
    `"${word}" is a property, which TMDL allows only under an object`;
  const UNDER = (word: string) =>
    `"${word}" at the root of a file has lines under it, which TMDL does not allow`;
  const one = (text: string) =>
    parseTmdl("tables/Sales.tmdl", text).issues.map((i) => [
      i.line,
      i.text,
      i.reason,
      i.canDropObjects,
    ]);

  it("reports a property that lost its tabs on its own line, once, and takes the lines under it out", () => {
    // The columns below attach to the property as children, which the model never reads.
    const text = [
      "table Sales",
      "\tcolumn Amount",
      "\t\tdataType: decimal",
      "\tcolumn Quantity",
      "sourceColumn: Quantity",
      "",
      "\tcolumn Region",
      "\t\tdataType: string",
      "",
    ].join("\n");
    expect(one(text)).toEqual([[5, "sourceColumn: Quantity", PROPERTY("sourceColumn"), true]]);
    expect(parseTmdl("t.tmdl", text).roots[0]!.children.map((c) => c.name)).toEqual([
      "Amount",
      "Quantity",
    ]);
  });

  it("names the property's word as written, a word TMDL declares at the root as an object included", () => {
    // `queryGroup` is a root object type, but `queryGroup: Support` is the property an expression
    // carries, so the word check alone would pass it.
    expect(one("queryGroup: Support\ndataType: decimal\n")).toEqual([
      [1, "queryGroup: Support", PROPERTY("queryGroup"), true],
      [2, "dataType: decimal", PROPERTY("dataType"), true],
    ]);
  });

  it("reports an expression with no name at the root once, on its first line, not on its value", () => {
    const text = [
      "table Sales",
      "\tpartition Sales = m",
      "\t\tmode: import",
      "source =",
      "\t\t\t\tlet",
      '\t\t\t\t    Source = Csv.Document(File.Contents("sales.csv"))',
      "\t\t\t\tin",
      "\t\t\t\t    Source",
      "",
      "\tcolumn Region",
      "\t\tdataType: string",
      "",
      "expression =",
      "\t\t1",
      "",
    ].join("\n");
    expect(one(text)).toEqual([
      [4, "source =", PROPERTY("source"), true],
      [13, "expression =", PROPERTY("expression"), true],
    ]);
  });

  it("reports a root annotation with a column under it once, on the annotation's line", () => {
    // A column's annotation that lost its two tabs: the next column attaches to it.
    const text = [
      "table Sales",
      "\tcolumn Amount",
      "\t\tdataType: decimal",
      "annotation SummarizationSetBy = Automatic",
      "",
      "\tcolumn Region",
      "\t\tdataType: string",
      "\t\tsummarizeBy: none",
      "",
      "\tmeasure Total = SUM(Sales[Amount])",
      "",
    ].join("\n");
    expect(one(text)).toEqual([
      [4, "annotation SummarizationSetBy = Automatic", UNDER("annotation"), true],
    ]);
  });

  it("reports a root extended property with a measure under its value once, on its line", () => {
    // The JSON block is its value, which the parser reads as such; the measure after it is not.
    const text = [
      "table Parameter",
      "\tcolumn 'Parameter Fields'",
      "\t\tdataType: string",
      "extendedProperty ParameterMetadata =",
      "\t\t\t\t{",
      '\t\t\t\t  "version": 3,',
      '\t\t\t\t  "kind": 2',
      "\t\t\t\t}",
      "",
      "\tmeasure Total = 1",
      "",
    ].join("\n");
    expect(one(text)).toEqual([
      [4, "extendedProperty ParameterMetadata =", UNDER("extendedProperty"), true],
    ]);
  });

  it("reports a property named annotation or extendedProperty with a line under it once, as a property", () => {
    expect(one("annotation: x\n\tcolumn C\nextendedProperty: y\n\tmeasure M = 1\n")).toEqual([
      [1, "annotation: x", PROPERTY("annotation"), true],
      [3, "extendedProperty: y", PROPERTY("extendedProperty"), true],
    ]);
  });

  it("names the word as written and keeps the issues in line order", () => {
    const text = [
      "table Sales",
      "\tcolumn Amount",
      "Annotation SummarizationSetBy = Automatic",
      "    column Spaced",
      "\tcolumn Region",
      "",
    ].join("\n");
    expect(one(text)).toEqual([
      [3, "Annotation SummarizationSetBy = Automatic", UNDER("Annotation"), true],
      [4, "    column Spaced", "space indentation (TMDL requires tabs)", true],
    ]);
  });

  it("reads a root annotation or extended property with nothing under it, a bare database, and createOrReplace, as before", () => {
    // Desktop writes a bare `database` on the first line of database.tmdl, with its properties
    // under it, and a model-level annotation at the root of model.tmdl.
    const text = [
      "database",
      "\tcompatibilityLevel: 1567",
      "",
      'annotation PBI_QueryOrder = ["Sales"]',
      "",
      "annotation __PBI_TimeIntelligenceEnabled = 1",
      "ref table Sales",
      "",
      "extendedProperty ParameterMetadata =",
      "\t\t{",
      '\t\t  "version": 1',
      "\t\t}",
      "",
      "createOrReplace",
      "",
      "\ttable Product",
      "\t\tcolumn Key",
      "\t\t\tdataType: int64",
      "",
    ].join("\n");
    const pf = parseTmdl("t.tmdl", text);
    expect(pf.issues).toEqual([]);
    expect(pf.roots.map((r) => [r.kind, r.type, r.children.length])).toEqual([
      ["flag", "database", 1],
      ["object", "annotation", 0],
      ["object", "annotation", 0],
      ["ref", "table", 0],
      ["object", "extendedproperty", 0],
      ["flag", "createorreplace", 1],
    ]);
  });
});

describe("whether a parse issue can take a line at the root of a file with it", () => {
  // A line at the root may be a table's declaration, and TMDL lets a table's declaration sit in
  // more than one file, so a file with such an issue may declare a table its roots do not show.
  const marks = (text: string) =>
    parseTmdl("t.tmdl", text).issues.map((i) => [i.line, i.canDropTableLine]);

  it("marks an issue on a line at the root that could be a table's, and a code fence left open that read one", () => {
    // A misspelt word, a flag such as `tableSales` that lost its space, and a line the parser could
    // not make out may each be a `table` line.
    expect(marks("tabel Sales\n\tmeasure Total = 1\n")).toEqual([[1, true]]);
    expect(marks("tableSales\n")).toEqual([[1, true]]);
    expect(marks("'Sales'\n\tmeasure Total = 1\n")).toEqual([
      [1, true],
      [2, false],
    ]);
    // A fence left open whose text is no deeper than its declaration reads every line below it
    // into its expression, a table's declaration included. Deeper text ends at a shallower line.
    expect(marks("table Sales\n\tmeasure M = ```\nx\n\ntable Product\n")).toEqual([[2, true]]);
    expect(marks("table Sales\n\tmeasure M = ```\n\t\tx\n\ntable Product\n")).toEqual([[2, false]]);
    expect(marks("table Sales\n\tmeasure M = ```\n\t\tx\n\tmeasure N = 1\n")).toEqual([[2, false]]);
  });

  it("does not mark a property, an expression with no name, or an annotation with lines under it, at the root", () => {
    // None of them is a `table` line, and the lines under each are indented, so none can take one.
    expect(marks("dataType: decimal\n")).toEqual([[1, false]]);
    expect(marks("expression =\n\t\t1\n")).toEqual([[1, false]]);
    expect(marks("annotation A = 1\n\tcolumn Region\n")).toEqual([[1, false]]);
    expect(marks("extendedProperty P =\n\t\t{}\n\tmeasure M = 1\n\ntable Sales\n")).toEqual([
      [1, false],
    ]);
  });

  it("marks a table line indented with spaces alone, and no other line indented with spaces", () => {
    // Spaces before a `table` line kept it from the root, where the table's declaration sits; a
    // column line indented with spaces was meant to sit under the table above it.
    expect(marks("  table Sales\n\tmeasure Total = 1\n")).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(marks("table Sales\n    column Amount\n\t    measure Total = 1\n")).toEqual([
      [2, false],
      [3, false],
    ]);
  });

  it("marks a lost line whose word is `table` at any indentation, and in any form (#132)", () => {
    // A stray tab, tabs and spaces, or a colon or an equals sign in place of the space: each may be
    // a table's declaration the parser could not read. The lines under it are not marked again.
    expect(marks("\ttable Date\n\t\tdataCategory: Time\n")).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(marks("\t  table Date\n")).toEqual([[1, true]]);
    expect(marks("table: Date\n")).toEqual([[1, true]]);
    expect(marks("table = Date\n")).toEqual([[1, true]]);
    // A word that only starts with `table`, and M text, are not a `table` line.
    expect(marks("table Sales\n    tablePermission X\n    Table.AddColumn(x)\n")).toEqual([
      [2, false],
      [3, false],
    ]);
  });

  it("marks the first line of a file that has lost its declaration's own line (#132)", () => {
    // The file's first lines sit under a declaration it does not have, which may be a table's.
    expect(marks("\tdataCategory: Time\n\tcolumn Date\n")).toEqual([
      [1, true],
      [2, false],
    ]);
    // An orphan after a line the parser skipped belongs to that line, whose own issue decides.
    expect(marks("  relationship r1\n\tfromColumn: A.K\n")).toEqual([
      [1, false],
      [2, false],
    ]);
  });

  it("does not mark a line nested under an object, or a description nothing claims", () => {
    expect(marks("table Sales\n\t'Unit Price'\n\t\t\tisHidden\n\t/// Described\n\n")).toEqual([
      [2, false],
      [3, false],
      [4, false],
    ]);
  });
});

describe("a code fence left open", () => {
  const OPEN = "unterminated code fence";
  const issues = (text: string) =>
    parseTmdl("t.tmdl", text).issues.map((i) => [
      i.line,
      i.text,
      i.reason,
      i.canDropObjects,
      i.canDropTableLine,
    ]);
  const read = (nodes: TmdlNode[]): unknown[] =>
    nodes.map((n) => [n.type, n.name, n.value, n.props, n.description]);

  it("is reported where it opens when a later expression's fence would close it, and each declaration after it is read", () => {
    // The UDF research's probe: every function in a model shares definition/functions.tmdl. The
    // fence read B's header and body as A's expression, and A took B's lineageTag.
    const text = [
      "function A = ```",
      "\t\t() => 1",
      "\tlineageTag: a",
      "",
      "function B = ```",
      "\t\t() => 2",
      "\t\t```",
      "\tlineageTag: b",
      "",
      "function C = () => 3",
      "",
    ].join("\n");
    const pf = parseTmdl("definition/functions.tmdl", text);
    expect(pf.issues.map((i) => [i.line, i.text, i.reason, i.canDropObjects])).toEqual([
      [1, "function A = ```", OPEN, true],
    ]);
    expect(read(pf.roots)).toEqual([
      ["function", "A", "() => 1", { lineagetag: "a" }, undefined],
      ["function", "B", "() => 2", { lineagetag: "b" }, undefined],
      ["function", "C", "() => 3", {}, undefined],
    ]);
  });

  it("ends where the text under it stops being indented, so a declaration with no fence after it is read", () => {
    // No later fence: the end of the file tells the parser the fence was never closed.
    const text = [
      "function A = ```",
      "\t\t() =>",
      "",
      "\t\t\t1",
      "",
      "/// Doubles",
      "function B = (x: INT64) => x * 2",
      "",
      "function C =",
      "\t\t() => 3",
      "",
    ].join("\n");
    const pf = parseTmdl("definition/functions.tmdl", text);
    expect(pf.issues.map((i) => [i.line, i.reason, i.canDropTableLine])).toEqual([
      [1, OPEN, false],
    ]);
    expect(read(pf.roots)).toEqual([
      ["function", "A", "() =>\n\n\t1", {}, undefined],
      ["function", "B", "(x: INT64) => x * 2", {}, "Doubles"],
      ["function", "C", "() => 3", {}, undefined],
    ]);
  });

  it("gives a table's columns and measures after it back to their table, and a table after it its own", () => {
    const text = [
      "table Sales",
      "\tmeasure Total = ```",
      "\t\t\tSUM(Sales[Amount])",
      "\tcolumn Amount",
      "\t\tdataType: decimal",
      "",
      "\tmeasure Profit = ```",
      "\t\t\t[Total] * 0.1",
      "\t\t\t```",
      "\t\tformatString: 0.00",
      "",
      "table Product",
      "\tmeasure Count = ```",
      "\t\t\tCOUNTROWS(Product)",
      "\t\t\t```",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([[2, "\tmeasure Total = ```", OPEN, true, false]]);
    const [sales, product] = parseTmdl("t.tmdl", text).roots;
    expect(read(sales!.children)).toEqual([
      ["measure", "Total", "SUM(Sales[Amount])", {}, undefined],
      ["column", "Amount", undefined, { datatype: "decimal" }, undefined],
      ["measure", "Profit", "[Total] * 0.1", { formatstring: "0.00" }, undefined],
    ]);
    expect(read(product!.children)).toEqual([
      ["measure", "Count", "COUNTROWS(Product)", {}, undefined],
    ]);
  });

  it("gives a fenced property after it, such as a format string's, to the object it opened on", () => {
    // The format string definition opens a fence of its own, one tab under the measure, so the
    // measure's fence never closed.
    const text = [
      "table Sales",
      "\tmeasure Total = ```",
      "\t\t\tSUM(Sales[Amount])",
      "\t\tformatStringDefinition = ```",
      '\t\t\t\t"#,0"',
      "\t\t\t\t```",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([[2, "\tmeasure Total = ```", OPEN, true, false]]);
    const total = parseTmdl("t.tmdl", text).roots[0]!.children[0]!;
    expect([total.value, total.props]).toEqual([
      "SUM(Sales[Amount])",
      { formatstringdefinition: '"#,0"' },
    ]);
  });

  it("runs to the next fence, or the end of the file, when the text under it is no deeper than its declaration", () => {
    // Fenced text may sit at any depth, even the root of the file, so nothing then says where the
    // expression ended. A `///` run directly above the next fence's declaration stays its own.
    const text = [
      "function A = ```",
      "() => 1",
      "function B = () => 2",
      "",
      "/// Triples",
      "function C = ```",
      "\t\t(x: INT64) => x * 3",
      "\t\t```",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([[1, "function A = ```", OPEN, true, true]]);
    expect(read(parseTmdl("t.tmdl", text).roots)).toEqual([
      ["function", "A", "() => 1\nfunction B = () => 2", {}, undefined],
      ["function", "C", "(x: INT64) => x * 3", {}, "Triples"],
    ]);
    expect(issues("table Sales\n\tmeasure M = ```\nx\n\ntable Product\n")).toEqual([
      [2, "\tmeasure M = ```", OPEN, true, true],
    ]);
  });

  it("leaves a `///` run directly above the other fence's declaration to it when the indented text runs that far", () => {
    const text = [
      "function A = ```",
      "\t() => 1",
      "\t/// Note",
      "\textendedProperty X = ```",
      "\t\t{}",
      "\t\t```",
      "",
    ].join("\n");
    const [a] = parseTmdl("t.tmdl", text).roots;
    expect(a!.value).toBe("() => 1");
    expect(read(a!.children)).toEqual([["extendedproperty", "X", "{}", {}, "Note"]]);
  });

  it("is one issue for each fence left open, in line order, and an empty expression when nothing sits under it", () => {
    const pf = parseTmdl(
      "t.tmdl",
      "function A = ```\nfunction B = ```\n\t\t() => 2\n\nfunction C = ```",
    );
    expect(pf.issues.map((i) => [i.line, i.reason])).toEqual([
      [1, OPEN],
      [2, OPEN],
      [5, OPEN],
    ]);
    expect(read(pf.roots)).toEqual([
      ["function", "A", "", {}, undefined],
      ["function", "B", "() => 2", {}, undefined],
      ["function", "C", "", {}, undefined],
    ]);
  });

  it("gives what follows back on a partition's source and on a calculation item", () => {
    const text = [
      "table 'Time Intelligence'",
      "\tcalculationGroup",
      "\t\tcalculationItem YTD = ```",
      "\t\t\t\tCALCULATE(SELECTEDMEASURE(), DATESYTD('Date'[Date]))",
      "\t\tcalculationItem PY = ```",
      "\t\t\t\tCALCULATE(SELECTEDMEASURE(), SAMEPERIODLASTYEAR('Date'[Date]))",
      "\t\t\t\t```",
      "",
      "\tpartition 'Time Intelligence' = m",
      "\t\tmode: import",
      "\t\tsource = ```",
      "\t\t\t\tlet",
      "\t\t\t\t    Source = 1",
      "\t\t\t\tin",
      "\t\t\t\t    Source",
      "",
      "\tannotation PBI_ResultType = Table",
      "",
    ].join("\n");
    expect(issues(text).map((i) => i.slice(0, 3))).toEqual([
      [3, "\t\tcalculationItem YTD = ```", OPEN],
      [11, "\t\tsource = ```", OPEN],
    ]);
    const [table] = parseTmdl("t.tmdl", text).roots;
    const [group, partition, annotation] = table!.children;
    expect(group!.children.map((c) => [c.name, c.value])).toEqual([
      ["YTD", "CALCULATE(SELECTEDMEASURE(), DATESYTD('Date'[Date]))"],
      ["PY", "CALCULATE(SELECTEDMEASURE(), SAMEPERIODLASTYEAR('Date'[Date]))"],
    ]);
    expect(partition!.props).toEqual({
      mode: "import",
      source: "let\n    Source = 1\nin\n    Source",
    });
    expect([annotation!.name, annotation!.value]).toEqual(["PBI_ResultType", "Table"]);
  });

  it("reads a closed fence verbatim, a line at the root of the file or one holding three backticks included", () => {
    // Only a line that opens a fence, a declaration whose `=` is followed by three backticks, says
    // an earlier fence was never closed. None of the 11,458 fences in the 23,457 TMDL files surveyed
    // on September 28, 2026 holds one, or any line with three backticks in it.
    const text = [
      "table Sales",
      "\tmeasure Fence = ```",
      '\t\t\tVAR tick = "```"',
      "table Product",
      '\t\t\tRETURN tick & "= ```"',
      "\t\t\t```",
      "",
    ].join("\n");
    const pf = parseTmdl("t.tmdl", text);
    expect(pf.issues).toEqual([]);
    expect(pf.roots).toHaveLength(1);
    expect(pf.roots[0]!.children[0]!.value).toBe(
      'VAR tick = "```"\ntable Product\nRETURN tick & "= ```"',
    );
  });
});

describe("a malformed table line (#135)", () => {
  const issues = (text: string) =>
    parseTmdl("t.tmdl", text).issues.map((i) => [
      i.line,
      i.reason,
      i.canDropObjects,
      i.canDropTableLine,
    ]);
  const outline = (nodes: TmdlNode[]): unknown[] =>
    nodes.map((n) => [n.type, n.name, outline(n.children)]);
  const ROOT_ONLY = '"table" is a type TMDL declares only at the root of a file or under a model';
  const QUOTES = "the name is not enclosed in single quotes as TMDL requires";

  it("reports a table under another object, and keeps nothing of it", () => {
    const text = "table Other\n\tcolumn X\n\ttable Date\n\t\tdataCategory: Time\n\t\tcolumn D\n";
    expect(issues(text)).toEqual([[3, ROOT_ONLY, true, true]]);
    expect(outline(parseTmdl("t.tmdl", text).roots)).toEqual([
      ["table", "Other", [["column", "X", []]]],
    ]);
    // A bare `table` flag under an object is the same line with its name lost.
    expect(issues("table Other\n\ttable\n")).toEqual([[2, ROOT_ONLY, true, true]]);
    // A database holds the model, not a table, so a stray tab under a bare `database` is one too.
    expect(issues("database\n\tcompatibilityLevel: 1567\n\ttable Date\n")).toEqual([
      [3, ROOT_ONLY, true, true],
    ]);
  });

  it("reads a table under a model, as a culture's translations and a TMDL script nest one, and a ref line", () => {
    const culture =
      "cultureInfo pt-PT\n\ttranslations\n\t\tmodel Model\n\t\t\ttable Sales\n\t\t\t\tcaption: Vendas\n";
    expect(issues(culture)).toEqual([]);
    expect(
      issues(
        "createOrReplace\n\n\tmodel Model\n\t\tculture: en-US\n\n\t\ttable Date\n\t\t\tcolumn D\n",
      ),
    ).toEqual([]);
    expect(issues("createOrReplace\n\n\ttable Date\n\t\tcolumn D\n")).toEqual([]);
    expect(issues("model Model\n\tref table Date\n")).toEqual([]);
  });

  it("reports a declaration the model reads by name that has none, and keeps nothing of it", () => {
    for (const word of [
      "table",
      "relationship",
      "role",
      "perspective",
      "cultureInfo",
      "expression",
      "function",
      "dataSource",
      "annotation",
    ]) {
      const pf = parseTmdl("t.tmdl", `${word}\n\tdataCategory: Time\n`);
      expect(issues(`${word}\n\tdataCategory: Time\n`), word).toEqual([
        [1, `"${word}" is declared with no name`, true, word === "table"],
      ]);
      expect(pf.roots, word).toEqual([]);
    }
    // A name written as two quotes is no name either.
    expect(issues("table ''\n\trole ''\n")).toEqual([
      [1, '"table" is declared with no name', true, true],
    ]);
    expect(parseTmdl("t.tmdl", "role ''\n").roots).toEqual([]);
    // Desktop writes a bare `database`, and the model reads a bare `model` as the model.
    expect(issues("database\n\tcompatibilityLevel: 1567\n\nmodel\n\tculture: en-US\n")).toEqual([]);
  });

  it("reports a name not enclosed in single quotes as TMDL requires, on any declaration, and keeps nothing of it", () => {
    expect(issues("table 'Date\n\tdataCategory: Time\n")).toEqual([[1, QUOTES, true, true]]);
    expect(parseTmdl("t.tmdl", "table 'Date\n\tdataCategory: Time\n").roots).toEqual([]);
    // TMDL encloses a name holding a quote in single quotes, so an unquoted one cannot hold one.
    expect(issues("table O'Brien\n")).toEqual([[1, QUOTES, true, true]]);
    // Nor can text follow the quote that closes one.
    expect(issues("table 'Date' extra\n")).toEqual([[1, QUOTES, true, true]]);
    // The quote left open swallowed the `=`, so the measure's expression went into its name.
    const measure = "table Sales\n\tmeasure 'Total = 1\n\t\tformatString: 0\n\tcolumn A\n";
    expect(issues(measure)).toEqual([[2, QUOTES, true, false]]);
    expect(outline(parseTmdl("t.tmdl", measure).roots)).toEqual([
      ["table", "Sales", [["column", "A", []]]],
    ]);
  });

  it("reads a quoted name with its quotes doubled, and a name with none", () => {
    expect(
      issues("table 'O''Brien'\n\tmeasure 'It''s' = 1\n\tcolumn 'Net Price'\n\tcolumn Qty\n"),
    ).toEqual([]);
  });

  it("ends an indented expression at a table line indented unlike its first line", () => {
    const text = "expression E =\n\t\tlet x = 1 in x\n    table Date\n\tdataCategory: Time\n";
    expect(issues(text)).toEqual([[3, "space indentation (TMDL requires tabs)", true, true]]);
    expect(parseTmdl("t.tmdl", text).roots[0]!.value).toBe("let x = 1 in x");
    // And one at the level of the declaration's properties, one tab deeper than the declaration,
    // where no line of its expression sits.
    const measure =
      "table S\n\tmeasure M =\n\t\t\tVAR x = 1\n\t\t\tRETURN x\n\t\t    table 'Date'\n";
    expect(issues(measure)).toEqual([[5, "space indentation (TMDL requires tabs)", true, true]]);
    expect(parseTmdl("t.tmdl", measure).roots[0]!.children[0]!.value).toBe("VAR x = 1\nRETURN x");
    // So does a code fence left open, whose text is read as an indented expression's.
    expect(
      issues("table S\n\tmeasure M = ```\n\t\t\tx\n    table Date\n\t\tdataCategory: Time\n"),
    ).toEqual([
      [2, "unterminated code fence", true, false],
      [4, "space indentation (TMDL requires tabs)", true, true],
    ]);
  });

  it("keeps a line of M or DAX that starts with `table` when it is indented as the block is", () => {
    // Desktop writes each line of an expression two tabs deeper than its declaration, then the
    // language's own indentation, which may be tabs or spaces.
    const m =
      "table S\n\tpartition P = m\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t    x = type\n\t\t\t\t        table [A = number]\n\t\t\t\tin x\n";
    expect(issues(m)).toEqual([]);
    expect(parseTmdl("t.tmdl", m).roots[0]!.children[0]!.children[0]!.value).toBe(
      "let\n    x = type\n        table [A = number]\nin x",
    );
    // A block indented with spaces throughout reads one as the block's too.
    expect(issues("expression E =\n    let\n    table x\n")).toEqual([]);
  });

  it("keeps an M step named Table deeper than the declaration, whatever the first line's indentation", () => {
    // The M's own indentation is tabs on `let` and spaces on the steps, as in a model on GitHub;
    // every line still sits deeper than `source =`, so each is the expression's.
    const source = [
      "table Reviews",
      "\tpartition Reviews = m",
      "\t\tmode: import",
      "\t\tsource =",
      "\t\t\t\t\t\t\t\tlet",
      "\t\t\t\t                    Source = Sql.Database(server, database),",
      '\t\t\t\t                    Table = Source{[Schema="dbo",Item="Reviews"]}[Data]',
      "\t\t\t\t\t\t\t\tin",
      "\t\t\t\t\t\t\t\t    Table",
      "",
    ].join("\n");
    expect(issues(source)).toEqual([]);
    expect(parseTmdl("t.tmdl", source).roots[0]!.children[0]!.children[1]!.value).toMatch(
      /Table = Source[^\n]*\n\t*in\n\t*\s*Table$/,
    );
  });
});

describe("declarations under a model (#137)", () => {
  const issues = (text: string) =>
    parseTmdl("t.tmdl", text).issues.map((i) => [
      i.line,
      i.reason,
      i.canDropObjects,
      i.canDropTableLine,
    ]);
  const outline = (nodes: TmdlNode[]): unknown[] =>
    nodes.map((n) => [n.type, n.name, outline(n.children)]);
  const underModel = (word: string) => `"${word}" is not a type TMDL declares under a model`;
  const underDatabase = (word: string) => `"${word}" is not a type TMDL declares under a database`;

  it("reads what TMDL allows under a root model, and under a model under a root database", () => {
    // The model's properties and flags, its ref lines, and each type TMDL declares at the root but
    // a model, a database, and a script's createOrReplace.
    const children = [
      "culture: en-US",
      "discourageImplicitMeasures",
      "dataAccessOptions",
      "\tlegacyRedirects",
      "ref table Sales",
      "table Sales",
      "\tcolumn Amount",
      "relationship r1",
      "\tfromColumn: Sales.Key",
      "role Readers",
      "perspective Finance",
      "cultureInfo en-US",
      'expression Server = "localhost"',
      "function Double = (x: INT64) => x * 2",
      "dataSource 'Legacy SQL' = provider",
      "queryGroup 'Fact Queries'",
      'annotation PBI_QueryOrder = ["Sales"]',
      "extendedProperty ParameterMetadata = 1",
      "bindingInfo Hint",
    ];
    const nest = (tabs: string) => children.map((l) => `${tabs}${l}\n`).join("");
    expect(issues(`model Model\n${nest("\t")}`)).toEqual([]);
    expect(
      issues(`database Sales\n\tcompatibilityLevel: 1567\n\tmodel Model\n${nest("\t\t")}`),
    ).toEqual([]);
    // Desktop writes a bare `database`, and the model reads a bare `model` as the model.
    expect(issues(`database\n\tmodel\n${nest("\t\t")}`)).toEqual([]);
  });

  it("reports a declaration TMDL does not allow under a model, and keeps nothing of it", () => {
    const text = [
      "model Model",
      "\tculture: en-US",
      "\tcolumn Stray",
      "\t\tdataType: string",
      "\ttabel Typo",
      "\tmeasure M = 1",
      "\tmodel Inner",
      "\t\ttable X",
      "\tdatabase Inner",
      "\ttable Kept",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([
      [3, underModel("column"), true, true],
      [5, underModel("tabel"), true, true],
      [6, underModel("measure"), true, true],
      [7, underModel("model"), true, true],
      [9, underModel("database"), true, true],
    ]);
    expect(outline(parseTmdl("t.tmdl", text).roots)).toEqual([
      [
        "model",
        "Model",
        [
          ["culture", undefined, []],
          ["table", "Kept", []],
        ],
      ],
    ]);
    // The same under a model under a root database.
    expect(issues("database\n\tmodel Model\n\t\tcolumn Stray\n")).toEqual([
      [3, underModel("column"), true, true],
    ]);
  });

  it("reports a declaration under a root database other than the model, and keeps nothing of it", () => {
    const text = [
      "database",
      "\tcompatibilityLevel: 1567",
      "\trelationship r9",
      "\t\tfromColumn: Sales.Key",
      "\trole Readers",
      "\texpression Server = 1",
      "\tannotation Note = 1",
      "\tmodel Model",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([
      [3, underDatabase("relationship"), true, true],
      [5, underDatabase("role"), true, true],
      [6, underDatabase("expression"), true, true],
      [7, underDatabase("annotation"), true, true],
    ]);
    expect(outline(parseTmdl("t.tmdl", text).roots)).toEqual([
      [
        "database",
        undefined,
        [
          ["compatibilitylevel", undefined, []],
          ["model", "Model", []],
        ],
      ],
    ]);
  });

  it("reports a declaration the model reads by name that has none under a model, as at the root", () => {
    for (const word of [
      "table",
      "relationship",
      "role",
      "perspective",
      "cultureInfo",
      "expression",
      "function",
      "dataSource",
      "annotation",
    ]) {
      const text = `model Model\n\t${word}\n\t\tdataCategory: Time\n`;
      expect(issues(text), word).toEqual([
        [2, `"${word}" is declared with no name`, true, word === "table"],
      ]);
      expect(outline(parseTmdl("t.tmdl", text).roots), word).toEqual([["model", "Model", []]]);
    }
    expect(issues("database\n\tmodel Model\n\t\ttable ''\n")).toEqual([
      [3, '"table" is declared with no name', true, true],
    ]);
  });

  it("reports an annotation or an extended property under a model with lines under it, as at the root", () => {
    // A column's annotation that lost two tabs, with the column after it attached to it.
    const text = [
      "model Model",
      "\ttable Sales",
      "\t\tcolumn Amount",
      "\tannotation SummarizationSetBy = Automatic",
      "\t\tcolumn Region",
      "\textendedProperty Meta = 1",
      "\t\tmeasure Total = 1",
      "\tannotation PBI_QueryOrder = 1",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([
      [4, '"annotation" under a model has lines under it, which TMDL does not allow', true, false],
      [
        6,
        '"extendedProperty" under a model has lines under it, which TMDL does not allow',
        true,
        false,
      ],
    ]);
  });

  it("reports a flag under a model or a database whose word is a type TMDL declares elsewhere", () => {
    // A bare `model` would hold the table under it, which the model never reads.
    expect(issues("model Model\n\tmodel\n\t\ttable Foo\n\tcreateOrReplace\n\tdatabase\n")).toEqual([
      [2, underModel("model"), true, true],
      [4, underModel("createOrReplace"), true, true],
      [5, underModel("database"), true, true],
    ]);
    expect(issues("database\n\trelationship\n\tannotation\n\tmodel\n")).toEqual([
      [2, underDatabase("relationship"), true, true],
      [3, underDatabase("annotation"), true, true],
    ]);
  });

  it("reports a property under a model whose word is a type TMDL declares there, and keeps nothing of it", () => {
    // `table: Sales` or `table = Other` for `table Sales`, and an expression's `queryGroup` that
    // lost its tabs. No property of a model has any of those words.
    const text =
      "model Model\n\ttable: Sales\n\t\tcolumn A\n\ttable = Other\n\tqueryGroup: Staging\n";
    const notProperty = (word: string) => `"${word}" is not a property TMDL allows under a model`;
    expect(issues(text)).toEqual([
      [2, notProperty("table"), true, true],
      [4, notProperty("table"), true, true],
      [5, notProperty("queryGroup"), true, false],
    ]);
    expect(parseTmdl("t.tmdl", text).roots[0]!.props).toEqual({});
  });

  it("reports a property or an expression under a model with lines under it", () => {
    // A column's property that lost a tab in a model.tmdl that nests its tables takes the column
    // and the measure after it. TMDL gives neither a property nor an expression with no name a
    // line under it.
    const text = [
      "model Model",
      "\tculture: en-US",
      "\ttable Sales",
      "\t\tcolumn A",
      "\tdataType: string",
      "\t\tcolumn B",
      "\t\tmeasure M = 1",
      "\tsource =",
      "\t\t\tlet x = 1 in x",
      "\t\tmeasure N = 1",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([
      [5, '"dataType" under a model has lines under it, which TMDL does not allow', true, false],
      [8, '"source" under a model has lines under it, which TMDL does not allow', true, false],
    ]);
  });

  it("reports a flag under a model with a declaration under it, and not one with flags under it", () => {
    // A column's flag that lost two tabs takes the column after it. The model's own block flags,
    // such as `dataAccessOptions`, hold flags of their own.
    const text = [
      "model Model",
      "\tdataAccessOptions",
      "\t\tlegacyRedirects",
      "\ttable Sales",
      "\t\tcolumn A",
      "\tisKey",
      "\t\tcolumn B",
      "",
    ].join("\n");
    expect(issues(text)).toEqual([
      [
        6,
        '"isKey" under a model has a declaration under it, which TMDL does not allow',
        true,
        false,
      ],
    ]);
  });

  it("marks a line lost directly under a model as one that can take a table line, as at the root", () => {
    expect(issues("model Model\n\ttable-Sales\n")).toEqual([[2, "unrecognized line", true, true]]);
    expect(issues("database\n\tmodel Model\n\t\ttable-Sales\n")).toEqual([
      [3, "unrecognized line", true, true],
    ]);
    // Deeper under the model, a line is a table's own.
    expect(issues("model Model\n\ttable Sales\n\t\t'Amount'\n")).toEqual([
      [3, "unrecognized line", true, false],
    ]);
    // A code fence left open whose text reads a table's declaration under the model.
    const fence = "model Model\n\ttable Sales\n\t\tmeasure M = ```\n\t\tSUM(1)\n\ttable Other\n";
    expect(issues(fence)).toEqual([[3, "unterminated code fence", true, true]]);
  });

  it("leaves a model under a culture's translations or a TMDL script to its own reading", () => {
    // Neither is the model's, so the lines under it are checked as any nested line is.
    expect(
      issues(
        "cultureInfo pt-PT\n\ttranslations\n\t\tmodel Model\n\t\t\ttable Sales\n\t\t\t\tcaption: Vendas\n\t\t\tcolumn X\n",
      ),
    ).toEqual([]);
    expect(
      issues("createOrReplace\n\n\tmodel Model\n\t\tculture: en-US\n\n\t\tmeasure M = 1\n"),
    ).toEqual([]);
  });
});

describe("valueLine", () => {
  it("is the header's own line for an inline value", () => {
    const pf = parseTmdl("t.tmdl", "table T\n\tmeasure M = 1\n");
    expect(pf.roots[0]!.children[0]).toMatchObject({ line: 2, valueLine: 2, value: "1" });
  });
  it("is the first non-blank line of an indented block, whose lines map one to one", () => {
    const pf = parseTmdl(
      "t.tmdl",
      "table T\n\tmeasure M =\n\n\t\t\tVAR x = 1\n\n\t\t\tRETURN x\n\t\tformatString: 0\n",
    );
    const m = pf.roots[0]!.children[0]!;
    expect(m).toMatchObject({ line: 2, valueLine: 4 });
    expect(m.value).toBe("VAR x = 1\n\nRETURN x");
  });
  it("is the line after the header for a code fence, closed or not", () => {
    const closed = parseTmdl(
      "t.tmdl",
      "table T\n\tmeasure M = ```\n\t\t\t1 +\n\t\t\t2\n\t\t\t```\n",
    );
    expect(closed.roots[0]!.children[0]).toMatchObject({ line: 2, valueLine: 3, value: "1 +\n2" });
    const open = parseTmdl("t.tmdl", "table T\n\tmeasure M = ```\n\t\t\t1\n\tmeasure N = 2\n");
    expect(open.roots[0]!.children[0]).toMatchObject({ line: 2, valueLine: 3 });
  });
  it("is set on an expression with no name, such as a calculated partition's source", () => {
    const pf = parseTmdl(
      "t.tmdl",
      "table T\n\tpartition T = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t\tCALENDAR(1, 2)\n",
    );
    const partition = pf.roots[0]!.children[0]!;
    expect(partition).toMatchObject({ kind: "object", line: 2, valueLine: 2, value: "calculated" });
    const source = partition.children.find((c) => c.type === "source")!;
    expect(source).toMatchObject({ kind: "expr", line: 4, valueLine: 5, value: "CALENDAR(1, 2)" });
  });
  it("is absent where no value is read after =", () => {
    const pf = parseTmdl("t.tmdl", "table T\n\tcolumn C\n\t\tdataType: int64\n");
    expect(pf.roots[0]!.valueLine).toBeUndefined();
    expect(pf.roots[0]!.children[0]!.valueLine).toBeUndefined();
    expect(pf.roots[0]!.children[0]!.children[0]!.valueLine).toBeUndefined();
  });
});
