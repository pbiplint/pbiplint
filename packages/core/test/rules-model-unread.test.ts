import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
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
    rule: "REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS",
    whole: legacy,
    partly: unread(legacy, "definition/tables/Legacy.tmdl"),
    wouldReport: ["Legacy SQL"],
  },
];

describe("a rule whose finding rests on the whole model (#128)", () => {
  const ruleNamed = (id: string) => defaultRules.find((r) => r.id === id)!;
  const reported = (r: ReturnType<typeof lint>, id: string) =>
    r.findings.filter((f) => f.ruleId === id).map((f) => f.objectName);

  describe.each(cases)("$rule", ({ rule, whole, partly, wouldReport }) => {
    const skipped = { id: rule, reason: "modelFileUnread" };

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
      expect(r.summary.rulesSkipped).toContainEqual(skipped);
    });
  });
});
