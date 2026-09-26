import { Window } from "happy-dom";
import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { lint, type LintOptions } from "../src/engine/lint.js";
import { finding, modelPartlyRead } from "../src/rules/helpers.js";
import { fieldFileUnread } from "../src/rules/report-helpers.js";
import type { Rule, RuleFinding } from "../src/rules/types.js";
import {
  formatJson,
  formatMarkdown,
  formatResult,
  formatSarif,
  formatText,
  FORMATS,
} from "../src/format/index.js";
import { showControls } from "../src/index.js";

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
    expect(text.split("\n")[1]).toBe("Model: 1 file. 1 rule run");
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
      "Model: 1 file. 1 rule run, 1 rule disabled by config, 1 finding ignored by annotation",
    );
  });
  it("says a rule was skipped because a report file could not be read, in text, Markdown, and JSON", () => {
    const wholeReport = (id: string): Rule => ({
      ...base,
      id,
      name: id,
      category: "Maintenance",
      severity: 1,
      layer: "project",
      needs: ["model", "report"],
      skipWhenUnread: fieldFileUnread,
      check: () => [],
    });
    const run = (rules: Rule[]) =>
      lint(
        [
          { path: "a.tmdl", text: "table A\n\tcolumn X\n\t\tdataType: string\n" },
          { path: "definition/pages/p/page.json", text: '{ "name": "p" }' },
          { path: "definition/pages/p/visuals/v/visual.json", text: '{\n  "name": "v",\n' },
        ],
        { rules: [oneColumn, ...rules] },
      );
    const one = run([wholeReport("WHOLE_REPORT")]);
    expect(formatText(one).split("\n")[1]).toBe(
      "Model: 1 file. Report: 2 files. 1 rule run, 1 rule skipped (a report file could not be read)",
    );
    expect(formatMarkdown(one).split("\n")[2]).toBe(
      "1 finding (0 errors, 1 warning, 0 info) in 3 files. Model: 1 file. Report: 2 files. 1 rule run, 1 rule skipped (a report file could not be read).",
    );
    expect(JSON.parse(formatJson(one)).summary.rulesSkipped).toEqual([
      { id: "WHOLE_REPORT", reason: "reportFileUnread" },
    ]);
    // SARIF lists no skipped rule for any reason, so it gains nothing here.
    expect(JSON.parse(formatSarif(one)).runs[0].invocations).toBeUndefined();
    expect(formatText(run([wholeReport("A"), wholeReport("B")])).split("\n")[1]).toBe(
      "Model: 1 file. Report: 2 files. 1 rule run, 2 rules skipped (a report file could not be read)",
    );
  });
  it("says a rule was skipped because a model file could not be fully read, in text, Markdown, and JSON", () => {
    const wholeModel = (id: string): Rule => ({
      ...base,
      id,
      name: id,
      category: "Maintenance",
      severity: 1,
      layer: "project",
      needs: ["model", "report"],
      skipWhenModelUnread: modelPartlyRead,
      check: () => [],
    });
    const run = (rules: Rule[]) =>
      lint(
        [
          { path: "a.tmdl", text: "table A\n\tcolumn X\n\t\tdataType: string\n" },
          { path: "definition/pages/p/page.json", text: '{ "name": "p" }' },
        ],
        { rules: [oneColumn, ...rules], unreadPaths: { model: ["b.tmdl"] } },
      );
    const one = run([wholeModel("WHOLE_MODEL")]);
    expect(formatText(one).split("\n")[1]).toBe(
      "Model: 1 file. Report: 1 file. 1 rule run, 1 rule skipped (a model file could not be fully read)",
    );
    expect(formatMarkdown(one).split("\n")[2]).toBe(
      "1 finding (0 errors, 1 warning, 0 info) in 2 files. Model: 1 file. Report: 1 file. 1 rule run, 1 rule skipped (a model file could not be fully read).",
    );
    expect(JSON.parse(formatJson(one)).summary.rulesSkipped).toEqual([
      { id: "WHOLE_MODEL", reason: "modelFileUnread" },
    ]);
    // SARIF lists no skipped rule for any reason, so it gains nothing here either.
    expect(JSON.parse(formatSarif(one)).runs[0].invocations).toBeUndefined();
    expect(formatText(run([wholeModel("A"), wholeModel("B")])).split("\n")[1]).toBe(
      "Model: 1 file. Report: 1 file. 1 rule run, 2 rules skipped (a model file could not be fully read)",
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
    // Finding rows carry a seven space indent, which is what picks the row out. This run is
    // model-only, so there is no facts block above them to confuse it with.
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
  const readable = [
    {
      path: "definition/report.json",
      text: j({ $schema: "https://x/report/3.2.0/schema.json" }),
    },
    { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
    { path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "Overview" }) },
  ];
  const project = lint(
    [
      ...files,
      ...readable,
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
    // The visual.json with a conflict marker could not be read, so NOT_REACHED_FROM_REPORT is
    // skipped; the report registers no custom visual, so REMOVE_UNUSED_CUSTOM_VISUALS runs.
    expect(lines[1]).toMatch(
      /^Model: 2 files\. Report: 4 files\. \d+ rules run, 5 rules skipped \(need a live model\), 1 rule skipped \(a report file could not be read\)$/,
    );
    expect(lines[2]).toBe("Notice: the walk stopped 64 folders deep inside Deep");
    expect(text).toContain("\nReport at a glance\n");
    expect(text).toMatch(
      /\n {2}Opens on {9}Overview \(the page open when it was saved; no landing page set\) {41}LANDING_PAGE_NOT_SET\n/,
    );
    expect(text).toMatch(
      /\n {2}Model {12}1 table, 1 column, 1 measure \(not reached from this report: unknown, a report file could not be read\)\n/,
    );
    // PARSE_ISSUE is an Error Prevention error, so it ranks first; the model's DAX error follows.
    expect(text).toMatch(/\n {2}1\. File could not be fully parsed {2}\(1 error\) {3}\[report\]\n/);
    expect(text).toMatch(/\n {2}\d\. .+ {3}\[model\]\n/);
    expect(text).toMatch(
      /\nERROR {2}\[report\] {3}File could not be fully parsed {2}PARSE_ISSUE {2}\(1\)\n/,
    );
    expect(text).toMatch(/\nERROR {2}\[model\] {4}Column references should be fully qualified/);
  });
  it("prints the counted Model row with NOT_REACHED_FROM_REPORT in the margin when every report file was read", () => {
    const text = formatText(lint([...files, ...readable]));
    expect(text.split("\n")[1]).toMatch(
      /^Model: 2 files\. Report: 3 files\. \d+ rules run, 5 rules skipped \(need a live model\)$/,
    );
    expect(text).toMatch(
      /\n {2}Model {12}1 table, 1 column, 1 measure \(1 column and 1 measure not reached from this report\) {3}NOT_REACHED_FROM_REPORT\n/,
    );
  });
  it("tags a parse-issue group spanning both layers as project in the text header", () => {
    const spanning = lint([
      { path: "definition/tables/Sales.tmdl", text: "table Sales\n  column Amount\n" },
      { path: "definition/pages/p/page.json", text: '{\n  "name": "p",\n<<<<<<< HEAD\n}\n' },
    ]);
    expect(formatText(spanning)).toContain("ERROR  [project]  File could not be fully parsed");
  });
  it("names present layers only and rides an absent layer's reason on the skipped line", () => {
    const text = formatText(lint(files));
    expect(text.split("\n")[1]).toMatch(/^Model: 2 files\. \d+ rules run/);
    expect(text.split("\n")[1]).not.toContain("Report:");
    expect(text).not.toContain("Report at a glance");
    const reportOnly = formatText(
      lint([{ path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "P" }) }], {
        absent: { model: "this report reads a published model" },
      }),
    );
    expect(reportOnly.split("\n")[1]).toMatch(
      /^Report: 1 file\. \d+ rules? run, \d+ rules skipped \(need a live model\), \d+ rules skipped \(this report reads a published model\)$/,
    );
    expect(reportOnly).toContain("\nReport at a glance\n");
  });
  it("leaves no stray space on either line when neither layer is present", () => {
    const nothing = lint([{ path: "README.md", text: "" }]);
    const line = formatText(nothing).split("\n")[1];
    expect(line).toMatch(/^\d+ rules? run, /);
    expect(line).not.toMatch(/ {2}/);
    // The reason still reaches the reader; with no layers named, it is all line 2 carries.
    expect(line).toContain("(no model in the input)");
    expect(formatMarkdown(nothing).split("\n")[2]).toBe(
      `0 findings (0 errors, 0 warnings, 0 info) in 0 files. ${line}.`,
    );
  });
  it("mirrors the same in markdown, with the facts as a table", () => {
    const md = formatMarkdown(project);
    expect(md).toContain("Model: 2 files. Report: 4 files.");
    expect(md).toMatch(
      /, 5 rules skipped \(need a live model\), 1 rule skipped \(a report file could not be read\)\.\n/,
    );
    expect(md).toContain(
      "| Model | 1 table, 1 column, 1 measure (not reached from this report: unknown, a report file could not be read) |  |",
    );
    expect(md).toContain("> Notice: the walk stopped 64 folders deep inside Deep");
    expect(md).toContain(
      "## Report at a glance\n\n| Fact | Value | Rule |\n|---|---|---|\n| Opens on | Overview (the page open when it was saved; no landing page set) | [LANDING_PAGE_NOT_SET](https://pbiplint.com/rules/landing-page-not-set) |",
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

describe("showControls", () => {
  it("writes each control character as \\u and four lowercase hex digits", () => {
    for (const [raw, shown] of [
      ["\u0000", "\\u0000"],
      ["\u001b", "\\u001b"],
      ["\u001f", "\\u001f"],
      ["\u007f", "\\u007f"],
      ["\u0080", "\\u0080"],
      ["\u009f", "\\u009f"],
      ["\u202a", "\\u202a"],
      ["\u202e", "\\u202e"],
      ["\u2066", "\\u2066"],
      ["\u2069", "\\u2069"],
    ])
      expect(showControls(raw!), shown).toBe(shown);
    expect(showControls("Evil\u001b[2J\nName\u202e")).toBe("Evil\\u001b[2J\\u000aName\\u202e");
  });
  it("leaves a character just outside each range, and a plain string, as it is", () => {
    for (const c of ["\u0020", "\u007e", "\u00a0", "\u2029", "\u202f", "\u2065", "\u206a"])
      expect(showControls(c), c.codePointAt(0)!.toString(16)).toBe(c);
    // Accented letters, CJK, emoji, and a backslash already in a name print as they are.
    const plain = "'Sales'[Total é] 売上 📈 C:\\Reports\\u001b";
    expect(showControls(plain)).toBe(plain);
  });
});

describe("control characters from the input", () => {
  // eslint-disable-next-line no-control-regex -- finding control characters is what this is for
  const RAW_CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
  // The same less the newline, which is the document's own line break.
  // eslint-disable-next-line no-control-regex -- finding control characters is what this is for
  const RAW_IN_JSON = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
  const hostileName = "Evil\u001b[2J\nName";
  const hostileFile = "definition/tables/S\u0007ales.tmdl";
  const hostile: Rule = {
    id: "HOSTILE",
    name: "Hostile names",
    category: "Maintenance",
    severity: 2,
    scope: ["Measure"],
    layer: "model",
    needs: ["model"],
    description: "",
    references: [],
    status: "ported",
    check: () => [
      {
        ruleId: "HOSTILE",
        layer: "model",
        objectType: "Measure",
        objectName: hostileName,
        location: { file: hostileFile, line: 2 },
        detail: "right\u202eleft",
      },
      {
        ruleId: "HOSTILE",
        layer: "model",
        objectType: "Measure",
        objectName: "Plain",
        location: { file: "definition/tables/Sales.tmdl", line: 5 },
        detail: "plain",
      },
    ],
  };
  const crashing: Rule = {
    ...hostile,
    id: "CRASHING",
    name: "Crashing",
    check() {
      throw new Error("failed on \u009b2J");
    },
  };
  const needsReport: Rule = {
    ...hostile,
    id: "NEEDS_REPORT",
    name: "Needs report",
    needs: ["report"],
  };
  const run = lint(files, {
    rules: [hostile, crashing, needsReport],
    diagnostics: [
      { kind: "unread-file", path: "x", message: "Bad\u001b]0;title\u0007 could not be read" },
    ],
    absent: { report: "this report reads a model outside the input (..\u202e\\M)" },
  });
  const noRaw = (text: string) => text.split("\n").filter((line) => RAW_CONTROL.test(line));

  it("shows them in the text format, and nothing raw reaches the output", () => {
    const text = formatText(run);
    expect(noRaw(text)).toEqual([]);
    const lines = text.split("\n");
    const name = "Evil\\u001b[2J\\u000aName";
    const file = "definition/tables/S\\u0007ales.tmdl:2";
    // The columns are measured on the shown text, so the detail column still lines up.
    expect(lines).toContain(`       ${name}  ${file}  right\\u202eleft`);
    expect(lines).toContain(
      `       ${"Plain".padEnd(name.length)}  ${"definition/tables/Sales.tmdl:5".padEnd(file.length)}  plain`,
    );
    expect(lines).toContain("Notice: Bad\\u001b]0;title\\u0007 could not be read");
    expect(lines[1]).toContain(
      "1 rule skipped (this report reads a model outside the input (..\\u202e\\M))",
    );
    expect(lines).toContain("  CRASHING: failed on \\u009b2J");
  });

  it("shows them in a fact's value, and the rule column still lines up", () => {
    const j = (v: unknown) => JSON.stringify(v);
    const text = formatText(
      lint([
        ...files,
        { path: "definition/report.json", text: j({}) },
        { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
        {
          path: "definition/pages/p/page.json",
          text: j({ name: "p", displayName: "Over\u001b[2J\u202eview" }),
        },
      ]),
    );
    expect(noRaw(text)).toEqual([]);
    const opens = text.split("\n").find((l) => l.startsWith("  Opens on"))!;
    const model = text.split("\n").find((l) => l.startsWith("  Model "))!;
    expect(opens).toMatch(/^ {2}Opens on +Over\\u001b\[2J\\u202eview \(the page open/);
    expect(opens.indexOf("LANDING_PAGE_NOT_SET")).toBe(model.indexOf("NOT_REACHED_FROM_REPORT"));
  });

  it("escapes DEL, C1, and the bidirectional controls in JSON and SARIF, which parse to the same value", () => {
    const raw = "a\u001b\u007f\u0080\u009b\u009f\u202a\u202e\u2066\u2069\n\tz";
    const named: Rule = {
      ...hostile,
      check: () => [
        { ruleId: "HOSTILE", layer: "model", objectType: "Measure", objectName: raw, detail: raw },
      ],
    };
    const result = lint(files, { rules: [named] });
    const json = formatJson(result);
    const sarif = formatSarif(result);
    for (const out of [json, sarif]) expect(RAW_IN_JSON.test(out)).toBe(false);
    expect(json).toContain(
      '"objectName": "a\\u001b\\u007f\\u0080\\u009b\\u009f\\u202a\\u202e\\u2066\\u2069\\n\\tz"',
    );
    expect(JSON.parse(json).groups[0].findings[0].objectName).toBe(raw);
    expect(JSON.parse(sarif).runs[0].results[0].message.text).toBe(
      `${raw}: Hostile names (${raw})`,
    );
  });
});

describe("the Markdown export and what the input holds", () => {
  /** The export as a Markdown viewer shows it: rendered as GitHub-flavoured Markdown, as the site renders it. */
  const rendered = (md: string) => {
    const { document } = new Window();
    document.body.innerHTML = marked.parse(md, { async: false });
    return document;
  };
  type Shown = ReturnType<typeof rendered>;
  /** Each body row of each table, as the text of its cells. */
  const rows = (doc: Shown): string[][] =>
    [...doc.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent ?? ""),
    );
  /** The text of each code span in each table cell. */
  const codes = (doc: Shown): string[] =>
    [...doc.querySelectorAll("td code")].map((c) => c.textContent ?? "");
  const one: Rule = {
    id: "ONE",
    name: "One finding",
    category: "Maintenance",
    severity: 2,
    scope: ["Measure"],
    layer: "model",
    needs: ["model"],
    description: "",
    references: [],
    status: "ported",
    check: () => [],
  };
  // Skipped on a run with no report, so the skipped line gives the report layer's reason.
  const needsReport: Rule = { ...one, id: "NEEDS_REPORT", needs: ["report"] };
  /**
   * The export of a run whose one model rule finds `finding` on a measure named M, unless it
   * names one.
   */
  const exported = (finding: Partial<RuleFinding>, options: LintOptions = {}): string =>
    formatMarkdown(
      lint(files, {
        ...options,
        rules: [
          { ...one, check: () => [{ objectType: "Measure", objectName: "M", ...finding }] },
          needsReport,
        ],
      }),
    );

  it("writes HTML in a finding's detail and location as text, not as elements", () => {
    const detail = "<script>alert(1)</script> & <b>bold</b> &amp; C:\\x\\<i>y</i> a\\|b";
    const file = "definition/tables/<i>Sales</i>.tmdl";
    const doc = rendered(exported({ detail, location: { file, line: 2 } }));
    expect(doc.querySelectorAll("script, b, i")).toHaveLength(0);
    expect(rows(doc)).toEqual([["M", "Measure", `${file}:2`, detail]]);
  });
  it("fences a name holding backticks so the whole name is one code span", () => {
    for (const name of ["a`b", "a``b", "`a", "a`", "a```b`", "``"]) {
      const doc = rendered(exported({ objectName: name }));
      expect(codes(doc), name).toEqual([name]);
      expect(rows(doc), name).toEqual([[name, "Measure", "", ""]]);
    }
  });
  it("keeps the spaces at each end of a name in its code span", () => {
    // CommonMark strips one space from each end of a code span that begins and ends with one and
    // is not all spaces; a name that is all spaces keeps them without help.
    for (const name of [" Sales ", "  Sales  ", " `a` ", " a", "a ", "  "]) {
      const doc = rendered(exported({ objectName: name }));
      expect(codes(doc), JSON.stringify(name)).toEqual([name]);
    }
  });
  it("writes Markdown syntax in a detail and a location as text, not as a code span, link, image, or emphasis", () => {
    /** The location and detail cells of a finding whose detail, and file name, hold `input`. */
    const cellsOf = (input: string) => {
      const file = `definition/tables/_${input}_.tmdl`;
      const doc = rendered(exported({ detail: input, location: { file, line: 1 } }));
      const [, , location, detail] = [...doc.querySelectorAll("tbody td")];
      return { doc, file, location: location!, detail: detail! };
    };
    for (const input of [
      // A code span would show the entities as written, `&lt;b&gt;`.
      "`<b>` & `x`",
      "[x](javascript:alert(1))",
      "*em* _em_ ~~s~~ ~s~ **strong** __strong__",
    ]) {
      const { file, location, detail } = cellsOf(input);
      // Text alone: no element in either cell, and the text is what the input holds.
      expect(location.children, input).toHaveLength(0);
      expect(detail.children, input).toHaveLength(0);
      expect(location.textContent, input).toBe(`${file}:1`);
      expect(detail.textContent, input).toBe(input);
    }
    // The URL inside is neither an image the viewer loads nor a link.
    const image = cellsOf("![](https://example.com/t.png)");
    expect(image.doc.querySelectorAll("img, td a")).toHaveLength(0);
    expect(image.detail.textContent).toBe("![](https://example.com/t.png)");
    // A notice and the skipped line's reason are written the same way.
    const doc = rendered(
      exported(
        {},
        {
          diagnostics: [
            { kind: "unread-file", path: "x", message: "`<b>` [x](javascript:alert(1)) *em*" },
          ],
          absent: { report: "~~a~~ _b_" },
        },
      ),
    );
    const notice = doc.querySelector("blockquote p")!;
    expect(notice.children).toHaveLength(0);
    expect(notice.textContent).toBe("Notice: `<b>` [x](javascript:alert(1)) *em*");
    const summary = doc.querySelector("p")!;
    expect(summary.children).toHaveLength(0);
    expect(summary.textContent).toMatch(/ \(~~a~~ _b_\)\.$/);
  });
  it("writes a URL, a www address, an email address, and a format string as text, not as a link or math", () => {
    // GitHub-flavoured Markdown links a bare URL, a www address, and an email address from the
    // source, where an escape inside one would land in the link, and GitHub reads $...$ as math.
    for (const input of [
      "https://contoso.sharepoint.com/sites/Finance_Team/Shared",
      "www.example.com/a_b_c",
      "first_last@example.com",
      "mailto:first_last@example.com",
      "$#,0.00;($#,0.00)",
    ]) {
      const md = exported({ detail: input });
      const doc = rendered(md);
      expect(doc.querySelectorAll("td a"), input).toHaveLength(0);
      expect(rows(doc), input).toEqual([["M", "Measure", "", input]]);
    }
    // marked reads no math, so the escape GitHub needs is asserted in the source.
    expect(exported({ detail: "$#,0.00;($#,0.00)" })).toContain("\\$#,0.00;(\\$#,0.00)");
  });
  it("keeps a name holding | in its cell, and in its code span, a backslash before it included", () => {
    for (const name of ["a|b", "a\\\\|b|"]) {
      const doc = rendered(exported({ objectName: name, detail: "d" }));
      expect(rows(doc), name).toEqual([[name, "Measure", "", "d"]]);
    }
    // One backslash before a pipe cannot be written in a table's code span for every viewer: the
    // site's renderer reads `\\|` as a backslash and then a new cell. It shows doubled, and the
    // rest of the name stays in the code span, never reaching the page as HTML.
    const doc = rendered(exported({ objectName: "a\\|<img src=x onerror=alert(1)>", detail: "d" }));
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(rows(doc)).toEqual([["a\\\\|<img src=x onerror=alert(1)>", "Measure", "", "d"]]);
  });
  it("writes a notice, a fact's value, and an absent layer's reason holding < and & as text", () => {
    const j = (v: unknown) => JSON.stringify(v);
    const md = formatMarkdown(
      lint(
        [
          ...files,
          { path: "definition/report.json", text: j({}) },
          {
            path: "definition/pages/pages.json",
            text: j({ pageOrder: ["p"], activePageName: "p" }),
          },
          {
            path: "definition/pages/p/page.json",
            text: j({ name: "p", displayName: "Over <b>view</b> & more" }),
          },
        ],
        {
          diagnostics: [
            { kind: "unread-file", path: "x", message: "<b>x</b> & y|z could not be read" },
          ],
        },
      ),
    );
    const doc = rendered(md);
    expect(doc.querySelectorAll("b")).toHaveLength(0);
    expect(doc.querySelector("blockquote")!.textContent!.trim()).toBe(
      "Notice: <b>x</b> & y|z could not be read",
    );
    expect(rows(doc)).toContainEqual([
      "Opens on",
      "Over <b>view</b> & more (the page open when it was saved; no landing page set)",
      "LANDING_PAGE_NOT_SET",
    ]);
    const absent = rendered(
      exported({}, { absent: { report: "this report reads <i>a model</i> & more" } }),
    );
    expect(absent.querySelectorAll("i")).toHaveLength(0);
    expect(absent.querySelector("p")!.textContent).toMatch(
      / \(this report reads <i>a model<\/i> & more\)\.$/,
    );
  });
  it("shows control characters, and a line break in a cell as a space, so nothing raw reaches the output", () => {
    // eslint-disable-next-line no-control-regex -- finding control characters is what this is for
    const RAW = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
    const md = exported(
      {
        objectName: "Evil\u001b[2J\u202e",
        detail: "one\r\ntwo\nthree\rfour\u0007",
        location: { file: "definition/tables/S\u0007ales.tmdl", line: 2 },
      },
      {
        diagnostics: [{ kind: "unread-file", path: "x", message: "Bad\u001b]0;t\u0007\nnext" }],
        absent: { report: "reason\r\nwith a break" },
      },
    );
    expect(RAW.test(md)).toBe(false);
    const doc = rendered(md);
    expect(codes(doc)).toEqual(["Evil\\u001b[2J\\u202e"]);
    expect(rows(doc)).toEqual([
      [
        "Evil\\u001b[2J\\u202e",
        "Measure",
        "definition/tables/S\\u0007ales.tmdl:2",
        "one two three four\\u0007",
      ],
    ]);
    // Outside a table, a line break is shown as the text format shows it.
    expect(doc.querySelector("blockquote")!.textContent!.trim()).toBe(
      "Notice: Bad\\u001b]0;t\\u0007\\u000anext",
    );
    expect(doc.querySelector("p")!.textContent).toMatch(/ \(reason\\u000d\\u000awith a break\)\.$/);
  });
});
