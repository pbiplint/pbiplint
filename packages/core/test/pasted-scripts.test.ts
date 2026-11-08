import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint, type LintResult } from "../src/engine/lint.js";
import { skippedLine } from "../src/format/text.js";
import { modelPartlyRead } from "../src/rules/helpers.js";
import { defaultRules } from "../src/rules/index.js";

// Pasted TMDL and a single .tmdl file named on the command line both reach `lint` as one file:
// the paste box as `pasted.tmdl`, the CLI by the file's base name (#274).
const paste = (text: string): Promise<LintResult> => lint([{ path: "pasted.tmdl", text }]);

/** As Power BI Desktop's TMDL view scripts an object: `createOrReplace`, a blank line, then every line one tab deeper. */
const asScript = (text: string): string =>
  `createOrReplace\n\n${text
    .split("\n")
    .map((l) => (l.trim() === "" ? l : `\t${l}`))
    .join("\n")}`;

/** A finding as a reader sees it, without its line, which a script's wrapper moves. */
const seen = (r: LintResult): string[] =>
  r.findings.map((f) => `${f.ruleId} ${f.objectType} ${f.objectName} ${f.detail ?? ""}`).sort();
const ids = (r: LintResult): string[] => r.findings.map((f) => f.ruleId);
const parseIssues = (r: LintResult) => r.findings.filter((f) => f.ruleId === "PARSE_ISSUE");

/**
 * The rules that need the whole model: those a model partly read stops (helpers.ts). One that
 * needs a report too is skipped for the report a paste lacks.
 */
const WHOLE_MODEL = defaultRules
  .filter((r) => r.skipWhenModelUnread === modelPartlyRead && !r.needs.includes("report"))
  .map((r) => r.id);

const SALES = [
  "table Sales",
  "\tmeasure 'Total Amount' = SUM(Sales[Amount])",
  "",
  "\tcolumn Amount",
  "\t\tdataType: double",
  "\t\tsummarizeBy: sum",
  "\t\tsourceColumn: Amount",
  "",
  "\tpartition Sales = m",
  "\t\tmode: import",
  "\t\tsource =",
  "\t\t\t\tlet",
  '\t\t\t\t\tSource = Csv.Document(File.Contents("C:\\Demo\\Data\\Sales.csv"))',
  "\t\t\t\tin",
  "\t\t\t\t\tSource",
  "",
].join("\n");

const CUSTOMER = readFileSync(
  new URL(
    "../../../examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/Customer.tmdl",
    import.meta.url,
  ),
  "utf8",
);

const ONE_MEASURE = [
  "createOrReplace",
  "",
  "\tref table Sales",
  "",
  "\t\tmeasure X = 1",
  "\t\t\tlineageTag: 0415b219-b6c0-403f-b95e-ede66fdb12a5",
  "",
].join("\n");

describe("pasted TMDL view scripts (#274)", () => {
  it("reads a table under createOrReplace as the same table with no wrapper", async () => {
    const plain = await paste(SALES);
    const script = await paste(asScript(SALES));
    expect(ids(plain)).toEqual(
      expect.arrayContaining([
        "NUMERIC_COLUMN_SUMMARIZE_BY",
        "PROVIDE_FORMAT_STRING_FOR_MEASURES",
        "LOCAL_DRIVE_PATH",
      ]),
    );
    expect(seen(script)).toEqual(seen(plain));
  });

  it("gives Desktop's script of the sample's Customer table the plain file's findings", async () => {
    const plain = await paste(CUSTOMER);
    const script = await paste(asScript(CUSTOMER));
    expect(plain.findings.length).toBeGreaterThan(1);
    expect(seen(script)).toEqual(seen(plain));
  });

  it("reads one measure under ref table, as TMDL view scripts a measure", async () => {
    const r = await paste(ONE_MEASURE);
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales"]);
    expect(r.model.tables[0]!.measures.map((m) => m.name)).toEqual(["X"]);
    expect(parseIssues(r)).toEqual([]);
    expect(r.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "PROVIDE_FORMAT_STRING_FOR_MEASURES",
        objectName: "[X]",
      }),
    );
    // The table's own declaration is not in the paste, so nothing is said about the table.
    expect(r.findings.filter((f) => f.objectName === "'Sales'")).toEqual([]);
  });

  it("reads a root ref table with a measure under it the same way", async () => {
    const root = await paste("ref table Sales\n\n\tmeasure X = 1\n\t\tlineageTag: x\n");
    expect(seen(root)).toEqual(seen(await paste(ONE_MEASURE)));
    expect(root.model.tables[0]!.measures.map((m) => m.name)).toEqual(["X"]);
  });

  it("merges a ref table's declarations into the table of that name", async () => {
    const r = await paste(`${SALES}\n${ONE_MEASURE}`);
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales"]);
    expect(r.model.tables[0]!.measures.map((m) => m.name)).toEqual(["Total Amount", "X"]);
    // Declared in the paste, so the table is linted as itself.
    expect(r.findings.some((f) => f.objectName === "'Sales'")).toBe(true);
  });

  it("creates the table when the paste has none of that name", async () => {
    const r = await paste(`${SALES}\n${ONE_MEASURE.replace("Sales", "Other")}`);
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales", "Other"]);
  });

  it.each([
    ["a measure alone", "measure X = 1\n\tformatString: 0\n", "measure"],
    ["a column alone", "column Amount\n\tdataType: double\n", "column"],
    ["a measure directly under createOrReplace", "createOrReplace\n\n\tmeasure X = 1\n", "measure"],
  ])("tells a paste of %s what to paste instead", async (_, text, word) => {
    const [issue, ...rest] = parseIssues(await paste(text));
    expect(rest).toEqual([]);
    expect(issue!.detail).toContain(`"${word}"`);
    expect(issue!.detail).toContain("table");
    expect(issue!.detail).toContain("TMDL view");
  });

  it("reads two complete tables as before", async () => {
    const r = await paste(`${SALES}\n${CUSTOMER}`);
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales", "Customer"]);
    expect(parseIssues(r)).toEqual([]);
  });

  it.each([
    ["a property", "createOrReplace\n\n\tculture: en-US\n"],
    ["a misspelt table", "createOrReplace\n\n\ttabel Sales\n\t\tmeasure X = 1\n"],
    [
      "a ref role with lines under it",
      "createOrReplace\n\n\tref role Reader\n\t\tmodelPermission: read\n",
    ],
    [
      "a misspelt measure under ref table",
      "createOrReplace\n\n\tref table Sales\n\t\tmeasur X = 1\n",
    ],
  ])("never drops %s in a script silently", async (_, text) => {
    expect(parseIssues(await paste(text))).toHaveLength(1);
  });

  it("reads a script of the whole model as a whole model", async () => {
    const r = await paste(
      asScript(`model Model\n\tculture: en-US\n\n\t${SALES.replace(/\n(?=.)/g, "\n\t")}`),
    );
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales"]);
    expect(r.model.props.culture).toBe("en-US");
    expect(r.summary.rulesSkipped.filter((s) => s.reason === "partOfModel")).toEqual([]);
    expect(ids(r)).toContain("MODEL_SHOULD_HAVE_A_DATE_TABLE");
  });
});

describe("a partial paste (#274)", () => {
  it("skips the rules that need the whole model, and says so", async () => {
    for (const text of [SALES, asScript(SALES), ONE_MEASURE]) {
      const r = await paste(text);
      expect(
        r.summary.rulesSkipped.filter((s) => s.reason === "partOfModel").map((s) => s.id),
      ).toEqual(WHOLE_MODEL);
      expect(ids(r)).not.toContain("MODEL_SHOULD_HAVE_A_DATE_TABLE");
      expect(skippedLine(r)).toContain(
        `${WHOLE_MODEL.length} rules skipped (the input is part of a model)`,
      );
    }
  });

  it("runs every rule on a paste that declares the model", async () => {
    const r = await paste(`model Model\n\n${SALES}`);
    expect(r.summary.rulesSkipped.filter((s) => s.reason === "partOfModel")).toEqual([]);
    expect(ids(r)).toContain("MODEL_SHOULD_HAVE_A_DATE_TABLE");
  });
});

describe("TMDLScripts in a project (#274)", () => {
  it("keeps a project's script tabs out of the model, with no issue", async () => {
    const r = await lint([
      { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
      { path: "definition/tables/Sales.tmdl", text: SALES },
      { path: "TMDLScripts/Script 1.tmdl", text: asScript(CUSTOMER) + "\n" + ONE_MEASURE },
    ]);
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales"]);
    expect(r.model.tables[0]!.measures.map((m) => m.name)).toEqual(["Total Amount"]);
    expect(parseIssues(r)).toEqual([]);
  });
});
