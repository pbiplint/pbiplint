import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { finding } from "../src/rules/helpers.js";
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
      /ERROR\s+\[model\]\s+Column references should be fully qualified\s+DAX_COLUMNS_FULLY_QUALIFIED\s+\(1\)/,
    );
    expect(text).toContain("https://pbiplint.com/rules/dax-columns-fully-qualified");
    expect(text).toMatch(/\[Total\]\s+definition\/tables\/Sales\.tmdl:5/);
    expect(text).toMatch(/'Sales'\[Amount\]\s+definition\/tables\/Sales\.tmdl:2/);
  });
});

describe("summary wording", () => {
  const base = {
    scope: [],
    description: "",
    references: [],
    status: "ported" as const,
    layer: "model" as const,
    needs: ["model"] as const,
  };
  const oneColumn: Rule = {
    ...base,
    id: "ONE_COLUMN",
    name: "One column",
    category: "Formatting",
    severity: 2,
    check: ({ model }) => model!.tables.flatMap((t) => t.columns.map((c) => finding.column(c))),
  };
  const everyTable: Rule = {
    ...base,
    id: "EVERY_TABLE",
    name: "Every table",
    category: "Maintenance",
    severity: 1,
    check: ({ model }) => model!.tables.map((t) => finding.table(t)),
  };
  it("uses singular nouns for counts of one", () => {
    const text = formatText(
      lint([{ path: "a.tmdl", text: "table A\n\tcolumn X\n\t\tdataType: string\n" }], {
        rules: [oneColumn],
      }),
    );
    expect(text.split("\n")[0]).toBe("pbiplint: 1 finding (0 errors, 1 warning, 0 info) in 1 file");
    expect(text.split("\n")[1]).toBe(
      "Model: 1 file. Report: absent (no report in the input). 1 rule run",
    );
  });
  it("uses singular nouns for one disabled rule and one ignored finding", () => {
    const text = formatText(
      lint(
        [
          {
            path: "a.tmdl",
            text: "table A\n\tcolumn X\n\t\tdataType: string\n\n\t\tannotation pbiplint.ignore = ONE_COLUMN\n\n\tcolumn Y\n\t\tdataType: string\n",
          },
        ],
        { rules: [oneColumn, everyTable], config: { rules: { EVERY_TABLE: "off" } } },
      ),
    );
    expect(text.split("\n")[1]).toBe(
      "Model: 1 file. Report: absent (no report in the input). 1 rule run, 1 rule disabled by config, 1 finding ignored by annotation",
    );
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
      layer: "model",
      needs: ["model"],
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
      layer: "model",
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
    const full = run.tool.driver.rules[ruleIndex].fullDescription;
    expect(full.text).toContain("refer to a column by its bare name, [Column]");
    expect(full.text).not.toContain("`");
    expect(full.markdown).toContain("`[Column]`");
    // Without a help map the help block still carries the description and the page link, since
    // GitHub shows help.markdown and ignores helpUri.
    const help = run.tool.driver.rules[ruleIndex].help;
    expect(help.markdown).toContain(
      "Read more: https://pbiplint.com/rules/dax-columns-fully-qualified",
    );
    expect(help.text).not.toContain("`");
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
    expect(group.findings[0]).toEqual({ layer: "model", objectType: "Model", objectName: "Model" });
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
    // Finding rows carry a seven space indent. The facts block's own "Model" row is indented two
    // and now sits above them, so the indent is what picks the finding row out.
    const line = formatText(single)
      .split("\n")
      .find(
        (l) => l.startsWith("       ") && (l.trim() === "Model" || l.trim().startsWith("Model ")),
      );
    expect(line).toBeDefined();
    expect(line).not.toContain(":0");
  });
});

describe("formatSarif with a help map", () => {
  it("uses the caller's help for a rule and falls back for the rest", () => {
    const help = {
      DAX_COLUMNS_FULLY_QUALIFIED: { text: "Why: plain.", markdown: "### Why\n\nplain." },
    };
    const rules = JSON.parse(formatSarif(result, { help })).runs[0].tool.driver.rules;
    const given = rules.find((r: { id: string }) => r.id === "DAX_COLUMNS_FULLY_QUALIFIED");
    expect(given.help).toEqual(help.DAX_COLUMNS_FULLY_QUALIFIED);
    const other = rules.find((r: { id: string }) => r.id !== "DAX_COLUMNS_FULLY_QUALIFIED");
    expect(other.help.markdown).toContain("Read more: https://pbiplint.com/rules/");
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

describe("SARIF URIs", () => {
  it("percent-encodes SARIF artifact URIs so a path with spaces is a valid URI", () => {
    const spaced = lint([
      {
        path: "definition/tables/ Spaced .tmdl",
        text: "table ' Spaced '\n\tcolumn 'A B'\n\t\tdataType: string\n\t\tsourceColumn: A B\n",
      },
    ]);
    const sarif = JSON.parse(formatSarif(spaced, { pathPrefix: "my models/demo.SemanticModel" }));
    const uris: string[] = sarif.runs[0].results
      .map(
        (r: { locations?: { physicalLocation: { artifactLocation: { uri: string } } }[] }) =>
          r.locations?.[0]?.physicalLocation.artifactLocation.uri,
      )
      .filter((u: string | undefined): u is string => u !== undefined);
    expect(uris.length).toBeGreaterThan(0);
    for (const u of uris) {
      expect(u).not.toContain(" ");
      expect(u).toBe("my%20models/demo.SemanticModel/definition/tables/%20Spaced%20.tmdl");
    }
  });
});

describe("formatResult", () => {
  it("dispatches by name", () => {
    expect(FORMATS).toEqual(["text", "json", "markdown", "sarif"]);
    expect(formatResult("json", result)).toBe(formatJson(result));
    expect(() => formatResult("xml" as never, result)).toThrow(/Unknown format/);
  });
});

describe("a whole-project report", () => {
  const j = (v: unknown) => JSON.stringify(v);
  const project = lint(
    [
      ...files,
      {
        path: "definition/report.json",
        text: j({ $schema: "https://x/report/3.2.0/schema.json" }),
      },
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
      { path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "Overview" }) },
      {
        path: "definition/pages/p/visuals/v/visual.json",
        text: '{\n  "name": "v",\n<<<<<<< HEAD\n}\n',
      },
    ],
    {
      diagnostics: [
        {
          kind: "depth-cap",
          message: "the walk stopped 64 folders deep inside Deep",
          path: "Deep",
        },
      ],
    },
  );
  it("prints the layers line, notices, the facts block, and a layer tag on every group in text", () => {
    const text = formatText(project);
    const lines = text.split("\n");
    expect(lines[1]).toMatch(
      /^Model: 2 files\. Report: 4 files\. \d+ rules run, 5 rules skipped \(need a live model\)$/,
    );
    expect(lines[2]).toBe("Notice: the walk stopped 64 folders deep inside Deep");
    expect(text).toContain("\nReport at a glance\n");
    expect(text).toMatch(
      /\n {2}Opens on {9}Overview \(the page open when it was saved; no landing page set\)\n/,
    );
    expect(text).toMatch(
      /\n {2}Model {12}1 table, 1 column, 1 measure \(1 column and 1 measure not reached from this report\)\n/,
    );
    // PARSE_ISSUE is an Error Prevention error, so it ranks first; the model's DAX error follows.
    expect(text).toMatch(/\n {2}1\. File could not be fully parsed {2}\(1 error\) {3}\[report\]\n/);
    expect(text).toMatch(/\n {2}\d\. .+ {3}\[model\]\n/);
    expect(text).toMatch(
      /\nERROR {2}\[report\] {3}File could not be fully parsed {2}PARSE_ISSUE {2}\(1\)\n/,
    );
    expect(text).toMatch(/\nERROR {2}\[model\] {4}Column references should be fully qualified/);
  });
  it("tags a parse-issue group spanning both layers as project in the text header", () => {
    const spanning = lint([
      { path: "definition/tables/Sales.tmdl", text: "table Sales\n  column Amount\n" },
      { path: "definition/pages/p/page.json", text: '{\n  "name": "p",\n<<<<<<< HEAD\n}\n' },
    ]);
    expect(formatText(spanning)).toContain("ERROR  [project]  File could not be fully parsed");
  });
  it("says which layer is absent and why", () => {
    const text = formatText(lint(files));
    expect(text.split("\n")[1]).toMatch(
      /^Model: 2 files\. Report: absent \(no report in the input\)\./,
    );
    const reportOnly = formatText(
      lint([{ path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "P" }) }], {
        absent: { model: "this report reads a published model" },
      }),
    );
    expect(reportOnly.split("\n")[1]).toMatch(
      /^Model: absent \(this report reads a published model\)\. Report: 1 file\. \d+ rules? run, \d+ rules skipped \(need a live model\), \d+ rules skipped \(no model in the input\)$/,
    );
  });
  it("mirrors the same in markdown, with the facts as a table", () => {
    const md = formatMarkdown(project);
    expect(md).toContain("Model: 2 files. Report: 4 files.");
    expect(md).toContain("> Notice: the walk stopped 64 folders deep inside Deep");
    expect(md).toContain(
      "## Report at a glance\n\n| Fact | Value | Rule |\n|---|---|---|\n| Opens on | Overview (the page open when it was saved; no landing page set) |  |",
    );
    expect(md).toMatch(/## ERROR: File could not be fully parsed \(1\) · report/);
  });
  it("adds layers, facts, and diagnostics to JSON and a layer to every finding without changing what was there", () => {
    const doc = JSON.parse(formatJson(project));
    expect(Object.keys(doc)).toEqual([
      "version",
      "tool",
      "summary",
      "layers",
      "facts",
      "diagnostics",
      "groups",
    ]);
    expect(doc.layers).toEqual({
      model: { present: true, files: 2 },
      report: { present: true, files: 4 },
    });
    expect(doc.facts[0]).toMatchObject({ layer: "report", label: "Opens on" });
    expect(doc.diagnostics).toEqual([
      { kind: "depth-cap", message: "the walk stopped 64 folders deep inside Deep", path: "Deep" },
    ]);
    const parse = doc.groups.find((g: { rule: { id: string } }) => g.rule.id === "PARSE_ISSUE");
    expect(parse.rule.layer).toBe("report");
    expect(parse.findings[0]).toMatchObject({
      layer: "report",
      objectType: "File",
      file: "definition/pages/p/visuals/v/visual.json",
      line: 3,
    });
  });
  it("prefixes report paths separately in SARIF, tags rules with their layer, and notes an incomplete read", () => {
    const sarif = JSON.parse(
      formatSarif(project, {
        pathPrefix: "proj/Demo.SemanticModel",
        reportPathPrefix: "proj/Demo.Report",
      }),
    );
    const run = sarif.runs[0];
    const uris = run.results.map(
      (r: { locations?: [{ physicalLocation: { artifactLocation: { uri: string } } }] }) =>
        r.locations?.[0]?.physicalLocation.artifactLocation.uri ?? "",
    );
    expect(uris).toContain("proj/Demo.Report/definition/pages/p/visuals/v/visual.json");
    expect(uris).toContain("proj/Demo.SemanticModel/definition/tables/Sales.tmdl");
    expect(
      run.tool.driver.rules.map((r: { id: string; properties: { layer: string } }) => [
        r.id,
        r.properties.layer,
      ]),
    ).toContainEqual(["PARSE_ISSUE", "report"]);
    expect(run.invocations).toEqual([
      {
        executionSuccessful: true,
        toolExecutionNotifications: [
          {
            level: "warning",
            descriptor: { id: "depth-cap" },
            message: { text: "the walk stopped 64 folders deep inside Deep" },
          },
        ],
      },
    ]);
    expect(JSON.parse(formatSarif(lint(files))).runs[0].invocations).toBeUndefined();
    // The project's .pbip sits one level above the report root, so its path reaches lint as
    // ../Demo.pbip. The artifact URI names the file where it really is, and a prefix that itself
    // begins with .. keeps its leading segment.
    const pbip = lint([{ path: "../Demo.pbip", text: "{" }]);
    const pbipUri = (reportPathPrefix: string): string => {
      const doc = JSON.parse(formatSarif(pbip, { reportPathPrefix })) as {
        runs: [
          {
            results: {
              ruleId: string;
              locations?: [{ physicalLocation: { artifactLocation: { uri: string } } }];
            }[];
          },
        ];
      };
      const hit = doc.runs[0].results.find((r) => r.ruleId === "PARSE_ISSUE");
      return hit!.locations![0].physicalLocation.artifactLocation.uri;
    };
    expect(pbipUri("proj/Demo.Report")).toBe("proj/Demo.pbip");
    expect(pbipUri("../proj/Demo.Report")).toBe("../proj/Demo.pbip");
  });
});
