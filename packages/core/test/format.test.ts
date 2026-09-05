import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
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

describe("formatResult", () => {
  it("dispatches by name", () => {
    expect(FORMATS).toEqual(["text", "json", "markdown", "sarif"]);
    expect(formatResult("json", result)).toBe(formatJson(result));
    expect(() => formatResult("xml" as never, result)).toThrow(/Unknown format/);
  });
});
