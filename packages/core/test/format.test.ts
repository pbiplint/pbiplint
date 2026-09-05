import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import type { Rule } from "../src/rules/types.js";
import {
  formatJson,
  formatMarkdown,
  formatResult,
  formatSarif,
  formatText,
  FORMATS,
} from "../src/format/index.js";

const files = [
  { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
  {
    path: "definition/tables/Sales.tmdl",
    text: "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n\tmeasure Total = SUM([Amount])\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
  },
];
const result = lint(files);

describe("formatText", () => {
  const text = formatText(result, { toolVersion: "1.2.3" });
  it("starts with the summary line and lists the top groups", () => {
    expect(text.split("\n")[0]).toMatch(
      /^pbiplint: \d+ findings \(\d+ errors, \d+ warnings, \d+ info\) in 2 files$/,
    );
    expect(text).toContain("Fix these first:");
    expect(text).toContain("5 rules skipped (need a live model)");
  });
  it("prints each group with severity, name, id, count, URL, and file locations", () => {
    expect(text).toMatch(
      /ERROR\s+Column references should be fully qualified\s+DAX_COLUMNS_FULLY_QUALIFIED\s+\(1\)/,
    );
    expect(text).toContain("https://pbiplint.com/rules/dax-columns-fully-qualified");
    expect(text).toMatch(/\[Total\]\s+definition\/tables\/Sales\.tmdl:5/);
    expect(text).toMatch(/'Sales'\[Amount\]\s+definition\/tables\/Sales\.tmdl:2/);
  });
});

describe("formatText with a crashing rule", () => {
  it("still reports rule errors when nothing else fired", () => {
    const throwingRule: Rule = {
      id: "THROWING_RULE",
      name: "Rule that throws",
      category: "Maintenance",
      severity: 2,
      scope: ["Table"],
      description: "Only exists to blow up.",
      references: [],
      status: "ported",
      check() {
        throw new Error("kaboom");
      },
    };
    const text = formatText(lint(files.slice(1), { rules: [throwingRule] }));
    expect(text).toContain("No findings.");
    expect(text).toContain("Rule errors");
    expect(text).toContain("kaboom");
  });
});

describe("formatJson", () => {
  it("is parseable and carries version, summary, and groups", () => {
    const json = JSON.parse(formatJson(result, { toolVersion: "1.2.3" }));
    expect(json.version).toBe(1);
    expect(json.tool).toEqual({ name: "pbiplint", version: "1.2.3" });
    expect(json.summary.files).toBe(2);
    const group = json.groups.find(
      (g: { rule: { id: string } }) => g.rule.id === "AVOID_FLOATING_POINT_DATA_TYPES",
    );
    expect(group.count).toBe(1);
    expect(group.findings[0]).toEqual({
      objectType: "Column",
      objectName: "'Sales'[Amount]",
      file: "definition/tables/Sales.tmdl",
      line: 2,
    });
    expect(group.rule.url).toBe("https://pbiplint.com/rules/avoid-floating-point-data-types");
  });
});

describe("formatMarkdown", () => {
  it("renders headings, links, and a table per group", () => {
    const md = formatMarkdown(result);
    expect(md.startsWith("# pbiplint report\n")).toBe(true);
    expect(md).toContain("## Fix these first");
    expect(md).toMatch(/## WARNING: Do not use floating point data types \(1\)/);
    expect(md).toContain(
      "[AVOID_FLOATING_POINT_DATA_TYPES](https://pbiplint.com/rules/avoid-floating-point-data-types)",
    );
    expect(md).toContain("| Object | Type | Location | Detail |");
    expect(md).toContain("| `'Sales'[Amount]` | Column | definition/tables/Sales.tmdl:2 |  |");
  });
});

describe("formatSarif", () => {
  it("emits SARIF 2.1.0 with rules and located results", () => {
    const sarif = JSON.parse(formatSarif(result, { toolVersion: "1.2.3" }));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
    const run = sarif.runs[0];
    expect(run.tool.driver).toMatchObject({
      name: "pbiplint",
      version: "1.2.3",
      informationUri: "https://pbiplint.com",
    });
    const ruleIndex = run.tool.driver.rules.findIndex(
      (r: { id: string }) => r.id === "DAX_COLUMNS_FULLY_QUALIFIED",
    );
    expect(ruleIndex).toBeGreaterThanOrEqual(0);
    expect(run.tool.driver.rules[ruleIndex]).toMatchObject({
      helpUri: "https://pbiplint.com/rules/dax-columns-fully-qualified",
      defaultConfiguration: { level: "error" },
      properties: { category: "DAX Expressions" },
    });
    expect(run.tool.driver.rules[ruleIndex].fullDescription.text).toContain("fully qualified");
    const res = run.results.find(
      (r: { ruleId: string }) => r.ruleId === "DAX_COLUMNS_FULLY_QUALIFIED",
    );
    expect(res).toMatchObject({
      ruleIndex,
      level: "error",
      message: { text: "[Total]: Column references should be fully qualified" },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "definition/tables/Sales.tmdl" },
            region: { startLine: 5 },
          },
        },
      ],
    });
    const info = run.results.find(
      (r: { ruleId: string }) => r.ruleId === "OBJECTS_WITH_NO_DESCRIPTION",
    );
    expect(info.level).toBe("note");
  });
});

describe("a model with no model.tmdl", () => {
  // buildModel synthesizes a Model whose location has an empty file, so Model findings carry no
  // location at all rather than a bogus ":0" that SARIF consumers reject.
  const single = lint([
    { path: "tables/T.tmdl", text: "table T\n\tcolumn C\n\t\tdataType: string\n" },
  ]);
  const RULE = "MODEL_SHOULD_HAVE_A_DATE_TABLE";

  it("leaves the location off the Model finding", () => {
    const f = single.findings.find((x) => x.ruleId === RULE);
    expect(f).toBeDefined();
    expect(f).not.toHaveProperty("location");
  });
  it("omits file and line from the JSON finding", () => {
    const json = JSON.parse(formatJson(single));
    const group = json.groups.find((g: { rule: { id: string } }) => g.rule.id === RULE);
    expect(group.findings[0]).toEqual({ objectType: "Model", objectName: "Model" });
    expect(group.findings[0]).not.toHaveProperty("file");
    expect(group.findings[0]).not.toHaveProperty("line");
  });
  it("omits locations from the SARIF result", () => {
    const res = JSON.parse(formatSarif(single)).runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === RULE,
    );
    expect(res).toBeDefined();
    expect(res).not.toHaveProperty("locations");
  });
  it("prints no :0 on the text line for the Model object", () => {
    const line = formatText(single)
      .split("\n")
      .find((l) => l.trim() === "Model" || l.trim().startsWith("Model "));
    expect(line).toBeDefined();
    expect(line).not.toContain(":0");
  });
});

describe("formatSarif with a pathPrefix", () => {
  it("joins the prefix in front of every artifact URI", () => {
    const sarif = JSON.parse(
      formatSarif(result, { pathPrefix: "tests/fixtures/x.SemanticModel" }),
    ) as {
      runs: [
        {
          results: { locations?: [{ physicalLocation: { artifactLocation: { uri: string } } }] }[];
        },
      ];
    };
    const uris = sarif.runs[0].results.flatMap(
      (r) => r.locations?.map((l) => l.physicalLocation.artifactLocation.uri) ?? [],
    );
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris)
      expect(uri.startsWith("tests/fixtures/x.SemanticModel/definition/")).toBe(true);
  });
  it("leaves URIs model-relative when the prefix is empty or absent", () => {
    expect(formatSarif(result, { pathPrefix: "" })).toBe(formatSarif(result));
    expect(formatSarif(result)).toContain('"uri": "definition/tables/Sales.tmdl"');
  });
  it("is ignored by the text, JSON, and markdown formats", () => {
    const prefix = { pathPrefix: "tests/fixtures/x.SemanticModel" };
    expect(formatText(result, prefix)).toBe(formatText(result));
    expect(formatJson(result, prefix)).toBe(formatJson(result));
    expect(formatMarkdown(result, prefix)).toBe(formatMarkdown(result));
  });
});

describe("formatResult", () => {
  it("dispatches by name", () => {
    expect(FORMATS).toEqual(["text", "json", "markdown", "sarif"]);
    expect(formatResult("json", result)).toBe(formatJson(result));
    expect(() => formatResult("xml" as never, result)).toThrow(/Unknown format/);
  });
});
