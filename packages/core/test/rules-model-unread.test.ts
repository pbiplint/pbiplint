import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import { modelPartlyRead, tablesPartlyRead } from "../src/rules/helpers.js";
import { defaultRules } from "../src/rules/index.js";

type File = { path: string; text: string };

const table = (name: string, body: string): File => ({
  path: `definition/tables/${name}.tmdl`,
  text: `table '${name}'\n${body}`,
});
const relationships = (text: string): File => ({ path: "definition/relationships.tmdl", text });

/** The run without `path`, which the input reader could not read. */
const unread = (whole: File[], path: string) => ({
  files: whole.filter((f) => f.path !== path),
  unreadPaths: [path],
});
/** The run with `path` holding `text`, which has a parse issue that takes a declaration out. */
const damaged = (whole: File[], path: string, text: string) => ({
  files: whole.map((f) => (f.path === path ? { path, text } : f)),
  unreadPaths: [],
});

interface Case {
  rule: string;
  /** Every file read: what the rule looks for is there, so it reports nothing. */
  whole: File[];
  /** The model pbiplint could not fully read, which lacks what the rule looks for. */
  partly: { files: File[]; unreadPaths: string[] };
  /** What the rule would report on that model, each finding false. */
  wouldReport: string[];
}

const sales = table("Sales", "\tcolumn Amount\n\t\tdataType: decimal\n");
const date = table(
  "Date",
  "\tdataCategory: Time\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisKey\n",
);
const salesAgg = table(
  "Sales Agg",
  "\tcolumn Amount\n\t\tdataType: decimal\n\t\talternateOf\n\t\t\tsummarization: sum\n\t\t\tbaseColumn: Sales.Amount\n",
);
const directQuery = [
  {
    path: "definition/model.tmdl",
    text: "model Model\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n",
  },
  table(
    "Sales",
    "\tcolumn Amount\n\t\tdataType: decimal\n\tpartition Sales = m\n\t\tmode: directQuery\n\t\tsource = 1\n",
  ),
  salesAgg,
];
const hiddenAmount = table("Sales", "\tcolumn Amount\n\t\tdataType: decimal\n\t\tisHidden\n");
const hiddenBase = table("Sales", "\tmeasure Base = 1\n\t\tisHidden\n");
const localDate = table(
  "LocalDateTable_1",
  "\tcolumn Date\n\t\tdataType: dateTime\n\t\tisHidden\n",
);
const orderDate = table(
  "Orders",
  "\tcolumn OrderDate\n\t\tdataType: dateTime\n\t\tvariation Variation\n\t\t\tisDefault\n\t\t\tdefaultColumn: LocalDateTable_1.Date\n",
);
const keyed = [
  table("Date", "\tcolumn DateKey\n\t\tdataType: int64\n"),
  table("Sales", "\tcolumn DateKey\n\t\tdataType: int64\n"),
  relationships("relationship r1\n\tfromColumn: Sales.DateKey\n\ttoColumn: Date.DateKey\n"),
];
const returnsTo = (r1: string) => [
  table("Product", "\tcolumn ProductKey\n\t\tdataType: int64\n"),
  table(
    "Sales",
    "\tcolumn ProductKey\n\t\tdataType: int64\n\tcolumn ReturnProductKey\n\t\tdataType: int64\n",
  ),
  relationships(
    `${r1}relationship r2\n\tisActive: false\n\tfromColumn: Sales.ReturnProductKey\n\ttoColumn: Product.ProductKey\n`,
  ),
];
const productKey =
  "relationship r1\n\tfromColumn: Sales.ProductKey\n\ttoColumn: Product.ProductKey\n\n";
const shipDate = [
  table("Date", "\tcolumn Date\n\t\tdataType: dateTime\n"),
  table(
    "Sales",
    "\tcolumn OrderDate\n\t\tdataType: dateTime\n\tcolumn ShipDate\n\t\tdataType: dateTime\n",
  ),
  relationships(
    "relationship r1\n\tfromColumn: Sales.OrderDate\n\ttoColumn: Date.Date\n\n" +
      "relationship r2\n\tisActive: false\n\tfromColumn: Sales.ShipDate\n\ttoColumn: Date.Date\n",
  ),
  table(
    "Measures",
    "\tmeasure 'Shipped' = CALCULATE(1, USERELATIONSHIP(Sales[ShipDate], Date[Date]))\n",
  ),
];
/** Four relationships, one of them both ways: a quarter of them, under the rule's three tenths. */
const fourRelationships = (first: string) =>
  relationships(
    `${first}relationship r2\n\tfromColumn: A.K2\n\ttoColumn: C.K\n\n` +
      "relationship r3\n\tfromColumn: A.K3\n\ttoColumn: D.K\n\n" +
      "relationship r4\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: A.K4\n\ttoColumn: E.K\n",
  );
const firstRelationship = "relationship r1\n\tfromColumn: A.K1\n\ttoColumn: B.K\n\n";
const margin = [
  table("Sales", "\tcolumn Margin\n\t\tdataType: decimal\n\tmeasure Check = [Margin] * 2\n"),
  table("Measures", "\tmeasure Margin = 1\n"),
];
const hybrid = (indent: string) =>
  table(
    "Sales",
    `${indent}partition 'Sales history' = m\n\t\tmode: import\n\t\tsource = 1\n` +
      "\tpartition 'Sales live' = m\n\t\tmode: directQuery\n\t\tsource = 2\n" +
      "\tmeasure YTD = TOTALYTD(1, 'Date'[Date])\n",
  );
const legacy = [
  {
    path: "definition/dataSources.tmdl",
    text: "dataSource 'Legacy SQL' = provider\n\tconnectionString: x\n",
  },
  table(
    "Legacy",
    "\tcolumn Id\n\t\tdataType: int64\n\tpartition Legacy = query\n\t\tsource\n\t\t\tquery = SELECT 1\n\t\t\tdataSource: 'Legacy SQL'\n",
  ),
];

const cases: Case[] = [
  {
    rule: "MODEL_SHOULD_HAVE_A_DATE_TABLE",
    whole: [sales, date],
    partly: unread([sales, date], date.path),
    wouldReport: ["Model"],
  },
  {
    rule: "MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS",
    whole: directQuery,
    partly: unread(directQuery, salesAgg.path),
    wouldReport: ["Model"],
  },
  {
    rule: "UNNECESSARY_COLUMNS",
    whole: [hiddenAmount, table("Measures", "\tmeasure Total = SUM(Sales[Amount])\n")],
    partly: unread([hiddenAmount], "definition/tables/Measures.tmdl"),
    wouldReport: ["'Sales'[Amount]"],
  },
  {
    rule: "UNNECESSARY_MEASURES",
    whole: [hiddenBase, table("Measures", "\tmeasure Doubled = [Base] * 2\n")],
    partly: unread([hiddenBase], "definition/tables/Measures.tmdl"),
    wouldReport: ["[Base]"],
  },
  {
    rule: "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS",
    whole: [localDate, orderDate],
    partly: unread([localDate, orderDate], orderDate.path),
    wouldReport: ["'LocalDateTable_1'[Date]"],
  },
  {
    rule: "ENSURE_TABLES_HAVE_RELATIONSHIPS",
    whole: keyed,
    partly: unread(keyed, "definition/relationships.tmdl"),
    wouldReport: ["'Date'", "'Sales'"],
  },
  {
    rule: "REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES",
    whole: returnsTo(productKey),
    // r1's declaration lost its tab, so the parser skips it and Sales[ProductKey] reads as unrelated.
    partly: damaged(
      returnsTo(productKey),
      "definition/relationships.tmdl",
      returnsTo(`    ${productKey}`)[2]!.text,
    ),
    wouldReport: ["'Sales'[ProductKey]"],
  },
  {
    rule: "INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED",
    whole: shipDate,
    partly: unread(shipDate, "definition/tables/Measures.tmdl"),
    wouldReport: ["'Sales'[ShipDate] ∞←1 'Date'[Date]"],
  },
  {
    rule: "AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS",
    whole: [fourRelationships(firstRelationship)],
    // r1 lost its tab, which leaves one of three both ways, over the three tenths.
    partly: damaged(
      [fourRelationships(firstRelationship)],
      "definition/relationships.tmdl",
      fourRelationships(`    ${firstRelationship}`).text,
    ),
    wouldReport: ["Model"],
  },
  {
    rule: "DAX_COLUMNS_FULLY_QUALIFIED",
    whole: margin,
    // Without the measure, [Margin] reads as the Sales column of that name.
    partly: unread(margin, "definition/tables/Measures.tmdl"),
    wouldReport: ["[Check]"],
  },
  {
    rule: "MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY",
    // A table is DirectQuery by its first partition. The import one lost its tab, so the parser
    // skips it and the DirectQuery one reads as first: a parse issue inside the table, which
    // takes no part of it, and a finding on a measure that can sit anywhere.
    whole: [hybrid("\t")],
    partly: damaged([hybrid("\t")], hybrid("\t").path, hybrid("    ").text),
    wouldReport: ["[YTD]"],
  },
  {
    rule: "REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS",
    whole: legacy,
    partly: unread(legacy, "definition/tables/Legacy.tmdl"),
    wouldReport: ["Legacy SQL"],
  },
];

const ruleNamed = (id: string) => defaultRules.find((r) => r.id === id)!;
const reported = (r: ReturnType<typeof lint>, id: string) =>
  r.findings.filter((f) => f.ruleId === id).map((f) => f.objectName);

/** The two runs every case makes: the whole model, and the model pbiplint could not fully read. */
function itSkipsWhilePartlyRead({ rule, whole, partly, wouldReport }: Case): void {
  it("runs and reports nothing while every model file was read", () => {
    const r = lint(whole);
    expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(r.summary.rulesSkipped.map((s) => s.id)).not.toContain(rule);
    expect(reported(r, rule)).toEqual([]);
  });

  it("is skipped with the reason while a model file could not be fully read", () => {
    const r = lint(partly.files, { unreadPaths: { model: partly.unreadPaths } });
    const model = r.project.model!;
    // Run on that model, the rule would state what is missing, and each finding would be false.
    expect(
      ruleNamed(rule)
        .check({ model }, { indexes: buildIndexes({ model }), options: {} })
        .map((f) => f.objectName),
    ).toEqual(wouldReport);
    expect(reported(r, rule)).toEqual([]);
    expect(r.summary.rulesSkipped).toContainEqual({ id: rule, reason: "modelFileUnread" });
  });
}

describe("a rule whose finding rests on the whole model (#128)", () => {
  describe.each(cases)("$rule", itSkipsWhilePartlyRead);
});

/** One part of a table whose declaration TMDL lets sit in more than one file. */
const part = (file: string, name: string, body: string): File => ({
  path: `definition/tables/${file}.tmdl`,
  text: `table '${name}'\n${body}`,
});
const withPart = (first: File, second: File) => ({
  whole: [first, second],
  partly: unread([first, second], second.path),
});
const calculated = (name: string) =>
  `\tpartition '${name}' = calculated\n\t\tmode: import\n\t\tsource = ROW("Value", 1)\n`;
const salesHidden = part("Sales.hidden", "Sales", "\tisHidden\n");
const dateMarked = part("Date.marked", "Date", "\tdataCategory: Time\n");
const dateKey = part("Date", "Date", "\tcolumn Date\n\t\tdataType: dateTime\n\t\tisKey\n");
const dateKeyed = [
  part("Date", "Date", "\tcolumn DateKey\n\t\tdataType: int64\n"),
  dateMarked,
  table("Sales", "\tcolumn DateKey\n\t\tdataType: int64\n"),
  relationships("relationship r1\n\tfromColumn: Sales.DateKey\n\ttoColumn: Date.DateKey\n"),
];
const twoPartitions = [
  part("Sales", "Sales", "\tpartition 'Sales 2024' = m\n\t\tmode: import\n\t\tsource = 1\n"),
  part("Sales.2025", "Sales", "\tpartition 'Sales 2025' = m\n\t\tmode: import\n\t\tsource = 2\n"),
];
const region = [
  part("Region", "Region", "\tcolumn Key\n\t\tdataType: int64\n"),
  part("Region.calc", "Region", calculated("Region")),
  table("Sales", "\tcolumn Key\n\t\tdataType: int64\n"),
  relationships(
    "relationship r1\n\ttoCardinality: many\n\tfromColumn: Sales.Key\n\ttoColumn: Region.Key\n",
  ),
  {
    path: "definition/roles/Reader.tmdl",
    text: "role Reader\n\tmodelPermission: read\n\ttablePermission Region = [Key] = USERNAME()\n",
  },
];
const tableCases: Case[] = [
  {
    rule: "NUMERIC_COLUMN_SUMMARIZE_BY",
    ...withPart(part("Sales", "Sales", "\tcolumn Amount\n\t\tdataType: decimal\n"), salesHidden),
    wouldReport: ["'Sales'[Amount]"],
  },
  {
    rule: "FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS",
    ...withPart(part("Sales", "Sales", "\tcolumn IsActive\n\t\tdataType: int64\n"), salesHidden),
    wouldReport: ["'Sales'[IsActive]"],
  },
  {
    rule: "PROVIDE_FORMAT_STRING_FOR_MEASURES",
    ...withPart(part("Sales", "Sales", "\tmeasure Total = 1\n"), salesHidden),
    wouldReport: ["[Total]"],
  },
  {
    rule: "DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN",
    // With its calculated partition, Value is a calculated table's column, which has no source.
    ...withPart(
      part("Calc", "Calc", "\tcolumn Value\n\t\tdataType: int64\n"),
      part("Calc.partition", "Calc", calculated("Calc")),
    ),
    wouldReport: ["'Calc'[Value]"],
  },
  {
    rule: "MARK_PRIMARY_KEYS",
    whole: dateKeyed,
    partly: unread(dateKeyed, dateMarked.path),
    wouldReport: ["'Date'[DateKey]"],
  },
  {
    rule: "AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY",
    // With its calculated partition, Region is a calculated table, which the rule leaves out.
    whole: region,
    partly: unread(region, "definition/tables/Region.calc.tmdl"),
    wouldReport: ["'Region'"],
  },
  {
    rule: "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE",
    ...withPart(dateKey, dateMarked),
    wouldReport: ["'Date'"],
  },
  {
    rule: "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE",
    // The marking part's `table` line has a stray tab, so the parser keeps nothing of that part.
    whole: [dateKey, dateMarked],
    partly: damaged([dateKey, dateMarked], dateMarked.path, `\t${dateMarked.text}`),
    wouldReport: ["'Date'"],
  },
  ...[
    // The marking part's `table` line sits under another table's declaration (#135).
    "table Other\n\tcolumn X\n\t\tdataType: int64\n\ttable 'Date'\n\t\tdataCategory: Time\n",
    // It has lost its name (#135).
    "table\n\tdataCategory: Time\n",
    // Its name's quote is not closed (#135).
    "table 'Date\n\tdataCategory: Time\n",
    // It is indented with spaces under an expression indented with tabs, which read it as text (#135).
    "expression E =\n\t\tlet x = 1 in x\n    table 'Date'\n\tdataCategory: Time\n",
  ].map((text): Case => ({
    rule: "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE",
    whole: [dateKey, dateMarked],
    partly: damaged([dateKey, dateMarked], dateMarked.path, text),
    wouldReport: ["'Date'"],
  })),
  {
    rule: "PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES",
    whole: twoPartitions,
    // The second part's `table` line is misspelt, so the parser keeps nothing under it.
    partly: damaged(
      twoPartitions,
      twoPartitions[1]!.path,
      twoPartitions[1]!.text.replace("table ", "tabel "),
    ),
    wouldReport: ["'Sales'"],
  },
  {
    rule: "CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS",
    ...withPart(
      part("CG.a", "CG", "\tcalculationGroup\n\t\tprecedence: 1\n"),
      part("CG", "CG", "\tcalculationGroup\n\n\t\tcalculationItem YTD = 1\n"),
    ),
    wouldReport: ["'CG'"],
  },
  {
    rule: "OBJECTS_WITH_NO_DESCRIPTION",
    ...withPart(part("Sales", "Sales", "\tcolumn Amount\n\t\tisHidden\n"), {
      path: "definition/tables/Sales.about.tmdl",
      text: "/// Sales lines\ntable Sales\n",
    }),
    wouldReport: ["'Sales'"],
  },
  {
    rule: "OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE",
    // A calculated table is out of the rule's scope.
    ...withPart(
      part("Calc", "Calc ", "\tcolumn Value\n\t\tdataType: int64\n"),
      part("Calc.partition", "Calc ", calculated("Calc 1")),
    ),
    wouldReport: ["'Calc '"],
  },
];

describe("a rule that reads what any part of a table's declaration can hold (#132)", () => {
  describe.each(tableCases)("$rule", (c) => {
    itSkipsWhilePartlyRead(c);

    it("runs while the only parse issue sits inside a table, where it cannot take a part", () => {
      // The property line is indented with spaces, so the parser skips it: a PARSE_ISSUE that can
      // drop a property of Other, and no table line.
      const other = table("Other", "\tcolumn X\n        dataType: int64\n");
      const r = lint([...c.whole, other]);
      expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toHaveLength(1);
      expect(r.summary.rulesSkipped).toContainEqual({
        id: "UNNECESSARY_COLUMNS",
        reason: "modelFileUnread",
      });
      expect(r.summary.rulesSkipped.map((s) => s.id)).not.toContain(c.rule);
    });
  });
});

describe("tablesPartlyRead", () => {
  const model = (files: File[], unreadPaths: string[] = []) =>
    lint(files, { unreadPaths: { model: unreadPaths } }).project.model!;
  const sales = table("Sales", "\tcolumn Amount\n\t\tdataType: decimal\n");
  it("holds while a model path could not be read, since it could hold a part of any table", () => {
    expect(tablesPartlyRead(model([sales], ["definition/tables/Other.tmdl"]))).toBe(true);
  });
  it("holds while a parse issue can take a table line", () => {
    expect(
      tablesPartlyRead(
        model(
          [sales, table("Date", "")].map((f) =>
            f.path.endsWith("Date.tmdl") ? { ...f, text: "tabel Date\n" } : f,
          ),
        ),
      ),
    ).toBe(true);
  });
  it("does not hold while every parse issue sits inside a declaration", () => {
    const m = model([sales, table("Other", "\tcolumn X\n        dataType: int64\n")]);
    expect(modelPartlyRead(m)).toBe(true);
    expect(tablesPartlyRead(m)).toBe(false);
  });
  it("does not hold while every model file was read", () => {
    expect(tablesPartlyRead(model([sales]))).toBe(false);
  });
});
