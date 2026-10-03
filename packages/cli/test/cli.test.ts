import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";

const repo = new URL("../../../", import.meta.url).pathname;
// A control character a terminal would act on, as the CLI must never write one raw.
// eslint-disable-next-line no-control-regex -- finding control characters is what this is for
const RAW_CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const sample = join(repo, "examples/messy-sales");

async function run(argv: string[], cwd = repo) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => cwd,
  });
  return { code, out, err };
}

/** A PBIP folder in a temp dir: a one-line model and a report of one page that reads it. */
function pbipProject(name: string): string {
  const root = tempDir(name);
  const j = (v: unknown) => JSON.stringify(v);
  const def = join(root, "Demo.Report", "definition");
  mkdirSync(join(root, "Demo.SemanticModel", "definition"), { recursive: true });
  mkdirSync(join(def, "pages", "p"), { recursive: true });
  writeFileSync(join(root, "Demo.pbip"), j({ version: "1.0", artifacts: [] }));
  writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
  writeFileSync(
    join(root, "Demo.Report", "definition.pbir"),
    j({ datasetReference: { byPath: { path: "../Demo.SemanticModel" } } }),
  );
  writeFileSync(join(def, "report.json"), "{}");
  writeFileSync(join(def, "pages", "pages.json"), j({ pageOrder: ["p"] }));
  writeFileSync(join(def, "pages", "p", "page.json"), j({ name: "p", displayName: "P" }));
  return root;
}

/**
 * Two projects in one folder, as mewancegeka/PBIWorkspace holds them (#86): Cost, whose model
 * has one table, and Sales, whose model has two, each with a .pbip naming its report and a report
 * of one page that reads its model.
 */
function workspace(): string {
  const root = tempDir("workspace");
  const j = (v: unknown) => JSON.stringify(v);
  for (const [name, tables] of [
    ["Cost", ["Cost"]],
    ["Sales", ["Sales", "Region"]],
  ] as const) {
    const model = join(root, `${name}.SemanticModel`, "definition");
    const def = join(root, `${name}.Report`, "definition");
    mkdirSync(model, { recursive: true });
    mkdirSync(join(def, "pages", "p"), { recursive: true });
    writeFileSync(
      join(root, `${name}.pbip`),
      j({ version: "1.0", artifacts: [{ report: { path: `${name}.Report` } }] }),
    );
    writeFileSync(join(model, "model.tmdl"), "model Model\n");
    for (const t of tables) writeFileSync(join(model, `${t}.tmdl`), `table ${t}\n`);
    writeFileSync(
      join(root, `${name}.Report`, "definition.pbir"),
      j({ datasetReference: { byPath: { path: `../${name}.SemanticModel` } } }),
    );
    writeFileSync(join(def, "report.json"), "{}");
    writeFileSync(join(def, "pages", "pages.json"), j({ pageOrder: ["p"] }));
    writeFileSync(join(def, "pages", "p", "page.json"), j({ name: "p", displayName: "P" }));
  }
  return root;
}

describe("pbiplint CLI", () => {
  it("lints the sample project and exits 1 because it has errors", async () => {
    const r = await run([sample]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(
      /^pbiplint: 266 findings \(19 errors, 77 warnings, 170 info\) in 92 files/,
    );
    expect(r.out).toContain("https://pbiplint.com/rules/provide-format-string-for-measures");
    expect(r.err).toBe("");
  });
  it("pins the sample's Report at a glance block, as the CLI reads the project", async () => {
    // By path, never --sample, which prefers the build's copy: the model, the report, and
    // pbiplint.config.json are read as the CLI resolves a project folder. Every fact was read
    // against the sample's files, and a value that disagrees with them is a bug, not a new pin.
    const r = await run([sample, "--format", "json", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).facts).toEqual([
      // pages.json sets no landing page, and its active page is Scratch, hidden in view mode.
      {
        layer: "report",
        label: "Opens on",
        value: "Scratch (hidden)",
        detail: "the page open when it was saved; no landing page set",
        ruleId: "OPENING_PAGE_INVALID",
      },
      // report.json saves the pane expanded. The rule is linked because pbiplint.config.json sets
      // FILTERS_PANE_STATE's policy (it expects the pane closed); without one the fact links none.
      { layer: "report", label: "Filters pane", value: "open", ruleId: "FILTERS_PANE_STATE" },
      // Scratch is hidden, and Product tooltip is a tooltip page by its type and its binding.
      {
        layer: "report",
        label: "Pages",
        value: "11",
        detail: "1 hidden, 1 tooltip",
        ruleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
      },
      // 58 visual.json files, two of them groups; two visuals hidden on Overview and two inside
      // the hidden group on Employees; report.json registers ChicletSlicer and no visual is one.
      {
        layer: "report",
        label: "Visuals",
        value: "56",
        detail: "4 hidden; 1 custom visual type registered, 0 used",
        ruleId: "HIDDEN_VISUAL_WITH_FIELDS",
      },
      // reportExtensions.json defines Net Margin and Margin % (report) on Sales.
      {
        layer: "report",
        label: "Report measures",
        value: "2",
        detail: "defined in the report, not the model",
        ruleId: "REPORT_LEVEL_MEASURES",
      },
      // Two catalog slicers: Category on Overview, which saves a selection, and City on Stores,
      // which saves a search term. The selection's rule is linked first.
      {
        layer: "report",
        label: "Slicers",
        value: "2",
        detail: "1 saved selection, 1 saved search term",
        ruleId: "SLICER_SELECTION_SAVED",
      },
      // No mobile.json anywhere in the report.
      { layer: "report", label: "Mobile layouts", value: "none" },
      {
        layer: "report",
        label: "Schema versions",
        value: "report 3.2.0, page 2.1.0, visual 2.8.0",
      },
      // Ten tables less Desktop's LocalDateTable and DateTableTemplate, 7 columns each.
      {
        layer: "model",
        label: "Model",
        value: "8 tables, 73 columns, 14 measures",
        detail: "36 columns and 2 measures not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      },
    ]);
    expect(r.err).toBe("");
  });
  it("--sample is the same as pointing at the bundled sample", async () => {
    const r = await run(["--sample", "--format", "json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).summary.findings).toBe(266);
  });
  it("--sample reads the bundled project, its model and its report, and prints no notice", async () => {
    const r = await run(["--sample", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Model: 14 files\. Report: 78 files\. /m);
    expect(r.err).toBe("");
  });
  it("respects --fail-on and exits 0 when nothing reaches the threshold", async () => {
    expect((await run([sample, "--fail-on", "none"])).code).toBe(0);
    expect((await run([join(repo, "tests/fixtures/kitchen-sink.SemanticModel")])).code).toBe(0);
    expect(
      (await run([join(repo, "tests/fixtures/kitchen-sink.SemanticModel"), "--fail-on", "info"]))
        .code,
    ).toBe(1);
  });
  it("writes every format, to stdout or to --output", async () => {
    for (const format of ["json", "sarif", "markdown"]) {
      const r = await run([sample, "--format", format]);
      expect(r.code).toBe(1);
      if (format === "markdown") expect(r.out.startsWith("# pbiplint report")).toBe(true);
      else expect(() => JSON.parse(r.out)).not.toThrow();
    }
    const dir = tempDir("out");
    const r = await run([sample, "--format", "sarif", "--output", "report.sarif"], dir);
    expect(r.out).toBe("");
    const sarif = JSON.parse(readFileSync(join(dir, "report.sarif"), "utf8"));
    expect(sarif.version).toBe("2.1.0");
    // The CLI hands the rule pages to the formatter, so every rule's help block is the page.
    for (const rule of sarif.runs[0].tool.driver.rules) {
      expect(rule.help.markdown, rule.id).toContain("### How to fix it");
      expect(rule.help.markdown, rule.id).toContain(`Read more: ${rule.helpUri}`);
    }
  });
  it("summarizes on stderr when the report goes to --output, naming the file as typed", async () => {
    const dir = tempDir("out");
    const r = await run([sample, "--format", "sarif", "--output", "out/report.sarif"], dir);
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe(
      "pbiplint: 266 findings (19 errors, 77 warnings, 170 info) in 92 files, wrote out/report.sarif\n",
    );
  });
  it("prefixes SARIF artifact URIs with the model root's path from the cwd", async () => {
    const r = await run([
      join(repo, "tests/fixtures/kitchen-sink.SemanticModel"),
      "--format",
      "sarif",
    ]);
    const results = JSON.parse(r.out).runs[0].results as {
      locations?: [{ physicalLocation: { artifactLocation: { uri: string } } }];
    }[];
    const uris = results.flatMap(
      (x) => x.locations?.map((l) => l.physicalLocation.artifactLocation.uri) ?? [],
    );
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris)
      expect(uri.startsWith("tests/fixtures/kitchen-sink.SemanticModel/definition/")).toBe(true);
  });
  it("discovers pbiplint.config.json above the model and honors --config", async () => {
    const dir = tempDir("cfg");
    const cfg = join(dir, "pbiplint.config.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        rules: {
          PROVIDE_FORMAT_STRING_FOR_MEASURES: "off",
          DAX_COLUMNS_FULLY_QUALIFIED: "warning",
        },
        failOn: "warning",
      }),
    );
    const r = await run([sample, "--config", cfg, "--format", "json"]);
    const json = JSON.parse(r.out);
    expect(json.summary.rulesSkipped).toContainEqual({
      id: "PROVIDE_FORMAT_STRING_FOR_MEASURES",
      reason: "disabled",
    });
    expect(
      json.groups.find((g: { rule: { id: string } }) => g.rule.id === "DAX_COLUMNS_FULLY_QUALIFIED")
        .rule.severity,
    ).toBe(2);
    expect(r.code).toBe(1);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, '{"rules": {"X": "loud"}}');
    const b = await run([sample, "--config", bad]);
    expect(b.code).toBe(2);
    expect(b.err).toMatch(/rules\["X"\]/);
  });
  it("warns on stderr about config rule ids that match no rule, and keeps going", async () => {
    const dir = tempDir("cfg-unknown");
    const cfg = join(dir, "pbiplint.config.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        rules: { HIDE_FOREIGN_KEY: "off", provide_format_string_for_measures: "off" },
      }),
    );
    const r = await run([sample, "--config", cfg, "--format", "json"]);
    expect(r.err).toBe(
      'pbiplint: pbiplint.config.json: no rule named "HIDE_FOREIGN_KEY" (run pbiplint rules for the list)\n',
    );
    expect(JSON.parse(r.out).summary.rulesSkipped).toContainEqual({
      id: "PROVIDE_FORMAT_STRING_FOR_MEASURES",
      reason: "disabled",
    });
    expect(r.code).toBe(1);
  });
  it("rejects a config file that is not a JSON object", async () => {
    const dir = tempDir("cfg-array");
    const cfg = join(dir, "array.json");
    writeFileSync(cfg, "[]");
    const r = await run([sample, "--config", cfg]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/must be a JSON object/);
  });
  it("lists rules", async () => {
    const r = await run(["rules"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /HIDE_FOREIGN_KEYS\s+model\s+ported\s+warning\s+Formatting\s+Hide foreign keys/,
    );
    expect(r.out).toMatch(/SPLIT_DATE_AND_TIME\s+model\s+needs live model/);
    expect(r.out.trim().split("\n").length).toBeGreaterThanOrEqual(72);
  });
  it("prints help and version, and exits 2 on usage errors", async () => {
    const help = (await run(["--help"])).out;
    expect(help).toContain("Usage: pbiplint");
    expect(help).toMatch(/\nThe pbiplint Privacy Promise: https:\/\/pbiplint\.com\/privacy\/\n$/);
    expect((await run(["--version"])).out).toMatch(/^pbiplint \d+\.\d+\.\d+/);
    const bad = await run(["--format", "xml", sample]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--format");
    const missing = await run([join(repo, "nope")]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("does not exist");
  });
  it("names a .pbix, says how to save it as a Power BI project, and exits 2 (tracked in #88)", async () => {
    const dir = tempDir("pbix");
    const how =
      "is a Power BI Desktop file (.pbix), which pbiplint cannot read. pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, choose File > Save as and pick Power BI project files (*.pbip) as the file type. See Microsoft Learn: https://learn.microsoft.com/power-bi/developer/projects/projects-overview#save-as-a-project";
    const file = join(dir, "Sales.pbix");
    writeFileSync(file, "");
    const lone = await run([file]);
    expect(lone.code).toBe(2);
    expect(lone.out).toBe("");
    expect(lone.err).toBe(`pbiplint: ${file} ${how}\nRun pbiplint --help for usage.\n`);
    const folder = await run([dir]);
    expect(folder.code).toBe(2);
    expect(folder.out).toBe("");
    expect(folder.err).toBe(`pbiplint: ${dir}/Sales.pbix ${how}\nRun pbiplint --help for usage.\n`);
  });
  it("names a model folder that holds no .tmdl files, says only TMDL can be linted, and exits 2 (tracked in #88)", async () => {
    const dir = tempDir("notmdl");
    const why =
      "holds no .tmdl files. Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.";
    mkdirSync(join(dir, "Old.SemanticModel"));
    // Given by a path relative to the working folder, the folder is named as main resolves it.
    for (const [argv, cwd] of [
      [[join(dir, "Old.SemanticModel")], repo],
      [["Old.SemanticModel"], dir],
    ] as const) {
      const r = await run([...argv], cwd);
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err).toBe(
        `pbiplint: ${dir}/Old.SemanticModel ${why}\nRun pbiplint --help for usage.\n`,
      );
    }
    // Ahead of a .pbix beside it, in the folder that holds both.
    writeFileSync(join(dir, "Sales.pbix"), "");
    const folder = await run([dir]);
    expect(folder.code).toBe(2);
    expect(folder.err).toBe(
      `pbiplint: ${dir}/Old.SemanticModel ${why}\nRun pbiplint --help for usage.\n`,
    );
  });
  it("names the model a report given alone reads, its control characters shown (tracked in #88)", async () => {
    // The path is the report's own text, not a file name, so it can hold the escape sequence that
    // clears the screen on any system.
    const report = join(tempDir("lone"), "Demo.Report");
    mkdirSync(join(report, "definition"), { recursive: true });
    writeFileSync(
      join(report, "definition.pbir"),
      JSON.stringify({ datasetReference: { byPath: { path: "../Evil\u001b[2J.SemanticModel" } } }),
    );
    writeFileSync(join(report, "definition", "report.json"), "{}");
    const r = await run([report, "--fail-on", "none"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      / rules? skipped \(this report reads \.\.\/Evil\\u001b\[2J\.SemanticModel, which this run did not include\)/,
    );
    expect(RAW_CONTROL.test(r.out.replace(/\n/g, ""))).toBe(false);
  });
  it("lints a whole project, prints layers in JSON, and puts notices on stderr", async () => {
    const root = tempDir("proj");
    mkdirSync(join(root, "Demo.SemanticModel", "definition"), { recursive: true });
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    mkdirSync(join(root, "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", "report.json"), "{}");
    const r = await run([root, "--format", "json", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.layers.model).toEqual({ present: true, files: 1 });
    expect(doc.layers.report).toEqual({
      present: false,
      reason: "the report is saved in the legacy report.json format",
    });
    expect(r.err).toBe(
      "pbiplint: notice: Demo.Report is stored as a single report.json (PBIR-Legacy), which pbiplint cannot read. Power BI Desktop converts it to PBIR when you edit and save it, in releases from September 2026 on. See Microsoft Learn: https://learn.microsoft.com/power-bi/developer/projects/projects-report#convert-existing-report-to-pbir\n",
    );
  });
  it("refuses a run that reads nothing but a legacy part, with exit 2 and the notice's words (#175)", async () => {
    const root = tempDir("legacy-only");
    mkdirSync(join(root, "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", "report.json"), "{}");
    for (const format of ["text", "markdown", "json", "sarif"]) {
      const r = await run([root, "--format", format]);
      expect(r.code).toBe(2);
      // Nothing on stdout, so no "No findings." and no report to pass as clean.
      expect(r.out).toBe("");
      expect(r.err).toBe(
        `pbiplint: ${root}/Demo.Report is stored as a single report.json (PBIR-Legacy), which pbiplint cannot read. Power BI Desktop converts it to PBIR when you edit and save it, in releases from September 2026 on. See Microsoft Learn: https://learn.microsoft.com/power-bi/developer/projects/projects-report#convert-existing-report-to-pbir\nRun pbiplint --help for usage.\n`,
      );
    }
    // A legacy model beside it is named on a line of its own, first, as the walk meets it.
    mkdirSync(join(root, "Demo.SemanticModel"));
    writeFileSync(join(root, "Demo.SemanticModel", "model.bim"), "{}");
    const both = await run([root]);
    expect(both.code).toBe(2);
    expect(both.err.split("\n").slice(0, 2)).toEqual([
      `pbiplint: ${root}/Demo.SemanticModel is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop`,
      expect.stringMatching(
        new RegExp(`^${root}/Demo\\.Report is stored as a single report\\.json`),
      ),
    ]);
  });
  it("names a legacy part left out beside a part it lints in the Markdown export too", async () => {
    const root = tempDir("legacy-beside");
    mkdirSync(join(root, "Demo.SemanticModel", "definition"), { recursive: true });
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    mkdirSync(join(root, "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", "report.json"), "{}");
    const r = await run([root, "--format", "markdown", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("the report is saved in the legacy report.json format");
    expect(r.out).toContain("Demo.Report is stored as a single report.json (PBIR-Legacy)");
  });
  it("lints each project of a folder that holds two by its .pbip, and refuses the folder", async () => {
    const root = workspace();
    // The model's files are model.tmdl and one per table; the report's are definition.pbir,
    // report.json, pages.json, page.json, and the project's .pbip.
    for (const [name, modelFiles] of [
      ["Cost", 2],
      ["Sales", 3],
    ] as const) {
      const r = await run([join(root, `${name}.pbip`), "--format", "json", "--fail-on", "none"]);
      expect(r.code).toBe(0);
      expect(r.err).toBe("");
      const doc = JSON.parse(r.out);
      expect(doc.layers.model).toEqual({ present: true, files: modelFiles });
      expect(doc.layers.report).toEqual({ present: true, files: 5 });
      expect(doc.diagnostics).toEqual([]);
    }
    const folder = await run([root]);
    expect(folder.code).toBe(2);
    expect(folder.err).toBe(
      `pbiplint: ${root} contains 2 semantic models; point at one of them: Cost.SemanticModel, Sales.SemanticModel\nRun pbiplint --help for usage.\n`,
    );
  });
  it("lints the one project below a folder as if pointed at it, its config included, and names it (#174)", async () => {
    // The sample, whose config sets the policies two of its report rules need, one folder down.
    const root = tempDir("below");
    cpSync(sample, join(root, "sub", "messy-sales"), { recursive: true });
    const notice =
      "sub/messy-sales is the only project found below the folder given, so it was linted as if given directly";
    const text = await run([root]);
    expect(text.code).toBe(1);
    expect(text.err).toBe(`pbiplint: notice: ${notice}\n`);
    expect(text.out).toBe((await run([sample])).out.replace("\n\n", `\nNotice: ${notice}\n\n`));
    const doc = JSON.parse((await run([root, "--format", "json"])).out);
    expect(doc.summary.findings).toBe(266);
    expect(doc.diagnostics).toEqual([
      { kind: "project-below-input", path: "sub/messy-sales", message: notice },
    ]);
    expect({ ...doc, diagnostics: [] }).toEqual(
      JSON.parse((await run([sample, "--format", "json"])).out),
    );
  });
  it("exits 2 on a folder with two projects below it, linting neither, and lists the command for each (#174)", async () => {
    const root = tempDir("below-two");
    for (const at of ["b", "a"]) cpSync(sample, join(root, at, "messy-sales"), { recursive: true });
    const r = await run([root, "--format", "json"]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toBe(
      `pbiplint: ${root} contains 2 projects; point at one of them:\n` +
        `  a/messy-sales: pbiplint ${root}/a/messy-sales\n` +
        `  b/messy-sales: pbiplint ${root}/b/messy-sales\n` +
        "Run pbiplint --help for usage.\n",
    );
    // Each line goes to stderr on its own, so a folder's name cannot write a line of its own.
    cpSync(sample, join(root, "c\nRun\u001b[2J"), { recursive: true });
    expect((await run([root])).err.split("\n")[3]).toBe(
      `  c\\u000aRun\\u001b[2J: pbiplint "${root}/c\\u000aRun\\u001b[2J"`,
    );
  });
  // These tests have the operating system refuse a read, as a POSIX system does for a user, or
  // put a symbolic link where the walk would read (CI runs them on Ubuntu). Root reads a folder
  // whatever its mode, and Windows ignores a mode of 000 and makes a symbolic link only in
  // Developer Mode or as an administrator, so they skip there.
  const onWindows = process.platform === "win32";
  const noModes = onWindows || process.getuid?.() === 0;
  const unread = (path: string, reason: string) => ({
    kind: "unread-file",
    path,
    message: `${path} could not be read (${reason}), so it was not linted`,
  });
  it.skipIf(noModes)(
    "lints the rest of a project around a folder it cannot read, with a notice naming it",
    async () => {
      const root = pbipProject("locked");
      const locked = join(root, "Demo.Report", "definition", "pages");
      chmodSync(locked, 0o000);
      try {
        const r = await run([root, "--format", "json", "--fail-on", "warning"]);
        const notice = unread("Demo.Report/definition/pages", "EACCES: permission denied");
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        expect(r.code).toBe(1);
        const doc = JSON.parse(r.out);
        expect(doc.layers.model.present).toBe(true);
        // definition.pbir, report.json, and the project's .pbip; nothing under pages.
        expect(doc.layers.report).toEqual({ present: true, files: 3 });
        expect(doc.diagnostics).toEqual([notice]);
        expect(doc.summary.warnings).toBeGreaterThan(0);
        // A SARIF consumer sees that the run did not read everything.
        const sarif = JSON.parse((await run([root, "--format", "sarif"])).out);
        expect(sarif.runs[0].invocations[0].toolExecutionNotifications).toEqual([
          {
            level: "warning",
            descriptor: { id: "unread-file" },
            message: { text: notice.message },
          },
        ]);
      } finally {
        chmodSync(locked, 0o755);
      }
    },
  );
  it.skipIf(noModes)(
    "leaves out a part folder it cannot read, saying so, and lints the other part",
    async () => {
      const root = pbipProject("locked-part");
      const locked = join(root, "Demo.Report");
      chmodSync(locked, 0o000);
      try {
        const r = await run([root, "--format", "json", "--fail-on", "warning"]);
        const notice = unread("Demo.Report", "EACCES: permission denied");
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        expect(r.code).toBe(1);
        const doc = JSON.parse(r.out);
        expect(doc.layers.model.present).toBe(true);
        expect(doc.layers.report).toEqual({
          present: false,
          reason: "the report folder could not be read",
        });
        expect(doc.diagnostics).toEqual([notice]);
        expect((await run([root])).out).toContain(
          "rules skipped (the report folder could not be read)",
        );
      } finally {
        chmodSync(locked, 0o755);
      }
    },
  );
  it.skipIf(onWindows)(
    "names a linked folder rather than reading through it, and says what it could not tell (#59)",
    async () => {
      // A linked pages folder was once passed over without a word: Pages 0, and a clean report.
      const root = pbipProject("linked");
      const def = join(root, "Demo.Report", "definition");
      const outside = tempDir("outside");
      renameSync(join(def, "pages"), join(outside, "pages"));
      symlinkSync(join(outside, "pages"), join(def, "pages"));
      const r = await run([root, "--format", "json"]);
      const notice = {
        kind: "unread-file",
        path: "Demo.Report/definition/pages",
        message:
          "Demo.Report/definition/pages is a symbolic link, which pbiplint does not follow, so it was not linted",
      };
      expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
      const doc = JSON.parse(r.out);
      expect(doc.layers.report.present).toBe(true);
      expect(doc.diagnostics).toEqual([notice]);
      expect(doc.facts.find((f: { label: string }) => f.label === "Pages")).toEqual({
        layer: "report",
        label: "Pages",
        value: "unknown",
        detail: "a page.json could not be read",
      });
    },
  );
  it.skipIf(noModes)(
    "says a part could not be read when its definition lists but none of its files read",
    async () => {
      const root = pbipProject("locked-files");
      const def = join(root, "Demo.Report", "definition");
      const locked = [join(def, "pages"), join(def, "report.json")];
      for (const p of locked) chmodSync(p, 0o000);
      try {
        const r = await run([root, "--format", "json", "--fail-on", "warning"]);
        const notices = [
          unread("Demo.Report/definition/pages", "EACCES: permission denied"),
          unread("Demo.Report/definition/report.json", "EACCES: permission denied"),
        ];
        expect(r.err).toBe(notices.map((n) => `pbiplint: notice: ${n.message}\n`).join(""));
        expect(r.code).toBe(1);
        const doc = JSON.parse(r.out);
        expect(doc.layers.report).toEqual({
          present: false,
          reason: "the report folder could not be read",
        });
        expect(doc.diagnostics).toEqual(notices);
      } finally {
        for (const p of locked) chmodSync(p, 0o755);
      }
    },
  );
  it.skipIf(noModes)(
    "names a folder once though a part given on its own is walked for each layer",
    async () => {
      const root = pbipProject("locked-once");
      const locked = join(root, "Demo.Report", "definition", "pages");
      chmodSync(locked, 0o000);
      try {
        const r = await run([join(root, "Demo.Report"), "--format", "json"]);
        const notice = unread("definition/pages", "EACCES: permission denied");
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        const doc = JSON.parse(r.out);
        expect(doc.layers.report.present).toBe(true);
        expect(doc.diagnostics).toEqual([notice]);
      } finally {
        chmodSync(locked, 0o755);
      }
    },
  );
  it.skipIf(noModes)(
    "refuses a .pbip it was pointed at and cannot read, and notes one it found",
    async () => {
      const root = pbipProject("locked-pbip");
      const pbip = join(root, "Demo.pbip");
      chmodSync(pbip, 0o000);
      try {
        const named = await run([pbip]);
        expect(named.code).toBe(2);
        expect(named.err).toBe(
          `pbiplint: Could not read ${pbip}: EACCES: permission denied\nRun pbiplint --help for usage.\n`,
        );
        const found = await run([root, "--fail-on", "none"]);
        expect(found.code).toBe(0);
        expect(found.err).toBe(
          `pbiplint: notice: ${unread("Demo.pbip", "EACCES: permission denied").message}\n`,
        );
      } finally {
        chmodSync(pbip, 0o644);
      }
    },
  );
  it.skipIf(noModes)(
    "says why the model is left out when the report a .pbip names has a definition.pbir it cannot read",
    async () => {
      const root = workspace();
      const pbir = join(root, "Cost.Report", "definition.pbir");
      chmodSync(pbir, 0o000);
      try {
        const input = join(root, "Cost.pbip");
        const r = await run([input, "--format", "json", "--fail-on", "none"]);
        const notice = unread("Cost.Report/definition.pbir", "EACCES: permission denied");
        expect(r.code).toBe(0);
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        const doc = JSON.parse(r.out);
        expect(doc.layers.model).toEqual({
          present: false,
          reason: "the report's definition.pbir could not be read",
        });
        expect(doc.layers.report.present).toBe(true);
        expect(doc.diagnostics).toEqual([notice]);
        expect((await run([input, "--fail-on", "none"])).out).toContain(
          "rules skipped (the report's definition.pbir could not be read)",
        );
      } finally {
        chmodSync(pbir, 0o644);
      }
    },
  );
  it.skipIf(noModes)(
    "names a model file it cannot read in the notice and reports no field that file could declare",
    async () => {
      // Store.tmdl declares the Store table, which the shelfmart report's visuals bind.
      const root = tempDir("locked-store");
      cpSync(join(repo, "tests/fixtures/shelfmart"), root, { recursive: true });
      const model = "ShelfMart Foot Traffic and Weather.SemanticModel";
      const store = join(root, model, "definition", "tables", "Store.tmdl");
      chmodSync(store, 0o000);
      try {
        const r = await run([root, "--format", "json", "--fail-on", "none"]);
        const notice = unread(`${model}/definition/tables/Store.tmdl`, "EACCES: permission denied");
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        expect(r.code).toBe(0);
        const doc = JSON.parse(r.out);
        expect(doc.diagnostics).toEqual([notice]);
        const ids = doc.groups.map((g: { rule: { id: string } }) => g.rule.id);
        expect(ids).not.toContain("BROKEN_FIELD_REFERENCE");
        // The notice names the file; no parse issue does.
        expect(ids).not.toContain("PARSE_ISSUE");
        // What the report reaches in a model it could not fully read is not known.
        expect(ids).not.toContain("NOT_REACHED_FROM_REPORT");
        expect(doc.summary.rulesSkipped).toContainEqual({
          id: "NOT_REACHED_FROM_REPORT",
          reason: "modelFileUnread",
        });
        // Store and its columns are not counted, so the counts are a lower bound, as they are
        // for a model file with a parse issue.
        expect(doc.facts.find((f: { label: string }) => f.label === "Model")).toEqual({
          layer: "model",
          label: "Model",
          value: "9 tables, 80 columns, 37 measures",
          detail: "not reached from this report: unknown, a model file could not be fully read",
        });
        expect((await run([root, "--fail-on", "none"])).out).toContain(
          "27 rules skipped (a model file could not be fully read)",
        );
      } finally {
        chmodSync(store, 0o644);
      }
    },
  );
  it.skipIf(noModes)(
    "says nothing is missing from a model while it cannot read the folder that could hold it (#128)",
    async () => {
      // The sample's model has a date table, in the tables folder the walk cannot list.
      const root = tempDir("locked-tables");
      const model = join(root, "Messy Sales Demo.SemanticModel");
      cpSync(join(repo, "examples/messy-sales/Messy Sales Demo.SemanticModel"), model, {
        recursive: true,
      });
      const tables = join(model, "definition", "tables");
      chmodSync(tables, 0o000);
      try {
        const r = await run([model, "--format", "json", "--fail-on", "none"]);
        const doc = JSON.parse(r.out);
        expect(doc.groups).toEqual([]);
        expect(doc.summary.rulesSkipped).toContainEqual({
          id: "MODEL_SHOULD_HAVE_A_DATE_TABLE",
          reason: "modelFileUnread",
        });
        expect((await run([model, "--fail-on", "none"])).out).toContain(
          "26 rules skipped (a model file could not be fully read)",
        );
      } finally {
        chmodSync(tables, 0o755);
      }
    },
  );
  it.skipIf(noModes)(
    "reads a report file it cannot read as one that could not be parsed, with a notice and no PARSE_ISSUE",
    async () => {
      const root = pbipProject("locked-visual");
      const folder = join(root, "Demo.Report", "definition", "pages", "p", "visuals", "v");
      mkdirSync(folder, { recursive: true });
      const visual = join(folder, "visual.json");
      writeFileSync(visual, JSON.stringify({ name: "v", visual: { visualType: "slicer" } }));
      chmodSync(visual, 0o000);
      try {
        const r = await run([root, "--format", "json", "--fail-on", "none"]);
        const notice = unread(
          "Demo.Report/definition/pages/p/visuals/v/visual.json",
          "EACCES: permission denied",
        );
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        const doc = JSON.parse(r.out);
        expect(doc.groups.map((g: { rule: { id: string } }) => g.rule.id)).not.toContain(
          "PARSE_ISSUE",
        );
        expect(doc.summary.rulesSkipped).toContainEqual({
          id: "NOT_REACHED_FROM_REPORT",
          reason: "reportFileUnread",
        });
        expect(doc.facts.find((f: { label: string }) => f.label === "Slicers")).toEqual({
          layer: "report",
          label: "Slicers",
          value: "unknown",
          detail: "saved selections and search terms: unknown, a visual.json could not be read",
        });
        expect(doc.facts.find((f: { label: string }) => f.label === "Model").detail).toBe(
          "not reached from this report: unknown, a report file could not be read",
        );
      } finally {
        chmodSync(visual, 0o644);
      }
    },
  );
  it("leaves an error that is not the operating system's to surface as unexpected", async () => {
    // Node refuses a path holding a NUL byte with ERR_INVALID_ARG_VALUE: a code, but no system
    // call, so it is not a file the resolver could not read.
    const r = await run(["a\u0000b"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^pbiplint: unexpected error: TypeError: .* without null bytes/);
    expect(r.err).toMatch(/\n\s+at resolveProject /);
    expect(r.err).not.toContain("Could not read");
    // A line break in the error's own message is shown, not written, so it cannot forge a line of
    // its own; the stack's frames follow it, one to a line.
    let err = "";
    const code = await main(["."], {
      stdout: () => {},
      stderr: (s) => (err += s),
      cwd: () => {
        throw new Error("boom\npbiplint: 0 findings\n    at forged (x.js:1:1)");
      },
    });
    expect(code).toBe(2);
    const [first, ...rest] = err.split("\n");
    expect(first).toBe(
      "pbiplint: unexpected error: Error: boom\\u000apbiplint: 0 findings\\u000a    at forged (x.js:1:1)",
    );
    expect(rest.at(-1)).toBe("");
    expect(rest.length).toBeGreaterThan(1);
    for (const line of rest.slice(0, -1)) expect(line).toMatch(/^ {4}at (?!forged)/);
  });
  it.skipIf(noModes)("refuses an input folder it cannot read at all, naming it", async () => {
    const root = pbipProject("locked-input");
    chmodSync(root, 0o000);
    try {
      const r = await run([root]);
      expect(r.code).toBe(2);
      expect(r.err).toBe(
        `pbiplint: Could not read ${root}: EACCES: permission denied\nRun pbiplint --help for usage.\n`,
      );
    } finally {
      chmodSync(root, 0o755);
    }
  });
  it.skipIf(noModes)(
    "refuses an input none of whose files could be read, rather than report no findings",
    async () => {
      const root = pbipProject("locked-all");
      const model = join(root, "Demo.SemanticModel");
      const report = join(root, "Demo.Report");
      const locked = [join(model, "definition"), report];
      for (const p of locked) chmodSync(p, 0o000);
      try {
        // A part given on its own whose definition cannot be listed, and a project whose every
        // part was refused, are each an input that could not be read. The message names the
        // first path that refused, below the input (or below a .pbip's folder), since the input
        // itself was read; the model is walked before the report. A part folder that refuses as
        // the input is the input's own refusal, and names the input.
        const cases: [input: string, refused: string][] = [
          [model, `${model}/definition`],
          [root, `${root}/Demo.SemanticModel/definition`],
          [join(root, "Demo.pbip"), `${root}/Demo.SemanticModel/definition`],
          [report, report],
        ];
        for (const [input, refused] of cases) {
          const r = await run([input]);
          expect(r.code).toBe(2);
          expect(r.out).toBe("");
          expect(r.err).toBe(
            `pbiplint: Could not read ${refused}: EACCES: permission denied\nRun pbiplint --help for usage.\n`,
          );
        }
      } finally {
        for (const p of locked) chmodSync(p, 0o755);
      }
    },
  );
  it.skipIf(onWindows)(
    "shows the control characters in a name instead of sending them to the terminal",
    async () => {
      // Windows refuses a control character in a file name, so the notice's folder cannot exist
      // there. The measure's name holds the escape sequence that clears the screen, DEL, the C1
      // control that starts a sequence on its own (CSI), and a right-to-left override.
      const root = tempDir("controls");
      const name = "Evil\u001b[2J\u007f\u009b\u202eX";
      const tables = join(root, "Demo.SemanticModel", "definition", "tables");
      mkdirSync(tables, { recursive: true });
      writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
      writeFileSync(join(tables, "T.tmdl"), `table T\n\tmeasure '${name}' = 1\n`);
      mkdirSync(join(root, "Bad\u001b[2J.Report"));
      writeFileSync(join(root, "Bad\u001b[2J.Report", "report.json"), "{}");
      const notice =
        "pbiplint: notice: Bad\\u001b[2J.Report is stored as a single report.json (PBIR-Legacy), which pbiplint cannot read. Power BI Desktop converts it to PBIR when you edit and save it, in releases from September 2026 on. See Microsoft Learn: https://learn.microsoft.com/power-bi/developer/projects/projects-report#convert-existing-report-to-pbir\n";

      const text = await run([root, "--fail-on", "none"]);
      expect(text.out).toContain("[Evil\\u001b[2J\\u007f\\u009b\\u202eX]");
      expect(RAW_CONTROL.test(text.out.replace(/\n/g, ""))).toBe(false);
      expect(text.err).toBe(notice);

      const json = await run([root, "--format", "json", "--fail-on", "none"]);
      const names = JSON.parse(json.out).groups.flatMap(
        (g: { findings: { objectName: string }[] }) => g.findings.map((f) => f.objectName),
      );
      expect(names).toContain(`[${name}]`);
      expect(RAW_CONTROL.test(json.out.replace(/\n/g, ""))).toBe(false);
      expect(json.err).toBe(notice);
    },
  );
  it("shows the control characters in a usage error and a config's rule id on stderr", async () => {
    const missing = await run([join(repo, "nope\u001b[2J")]);
    expect(missing.code).toBe(2);
    expect(missing.err).toBe(
      `pbiplint: ${join(repo, "nope")}\\u001b[2J does not exist\nRun pbiplint --help for usage.\n`,
    );
    const dir = tempDir("cfg-controls");
    const cfg = join(dir, "pbiplint.config.json");
    writeFileSync(cfg, JSON.stringify({ rules: { "NOPE\u202e\u009b": "off" } }));
    const r = await run([sample, "--config", cfg, "--format", "json", "--fail-on", "none"]);
    expect(r.err).toBe(
      'pbiplint: pbiplint.config.json: no rule named "NOPE\\u202e\\u009b" (run pbiplint rules for the list)\n',
    );
  });
  it("lists the layer of every rule", async () => {
    const r = await run(["rules"]);
    expect(r.out).toMatch(/^PARSE_ISSUE\s+project\s+builtin/m);
    expect(r.out).toMatch(/^HIDE_FOREIGN_KEYS\s+model\s+ported/m);
  });
});

describe("the CLI's output and CI log command sequences", () => {
  /** A model whose one measure's name, and one file's name, carry the sequences. */
  function hostile(): string {
    const root = tempDir("log-commands");
    mkdirSync(join(root, "definition", "tables"), { recursive: true });
    writeFileSync(join(root, "definition", "model.tmdl"), "model Model\n");
    writeFileSync(
      join(root, "definition", "tables", "::warning::t.tmdl"),
      "table T\n\tmeasure 'x ##vso[task.setvariable variable=a]b ##[warning]w ##teamcity[m]' = 1\n",
    );
    return join(root, "definition");
  }
  /** A sequence a CI agent reads as a command: ## before a word and [, or a line starting with ::. */
  const COMMAND = /##\w*\[|^[^\S\n]*::/m;
  it("writes none to stdout in any format, nor to stderr", async () => {
    const input = hostile();
    for (const format of ["text", "markdown", "json", "sarif"]) {
      const r = await run([input, "--format", format, "--fail-on", "none"]);
      expect(r.code, format).toBe(0);
      expect(r.out, format).toContain("#\\u0023vso[");
      expect(COMMAND.test(r.out), format).toBe(false);
      expect(COMMAND.test(r.err), format).toBe(false);
    }
  });
  it("writes JSON and SARIF to stdout that parse to what --output writes, which holds the input as written", async () => {
    const input = hostile();
    for (const format of ["json", "sarif"]) {
      const file = join(tempDir("log-commands-out"), `out.${format}`);
      const toFile = await run([input, "--format", format, "--fail-on", "none", "--output", file]);
      expect(toFile.code, format).toBe(0);
      const written = readFileSync(file, "utf8");
      expect(written, format).toContain("##vso[task.setvariable");
      const r = await run([input, "--format", format, "--fail-on", "none"]);
      expect(JSON.parse(r.out), format).toEqual(JSON.parse(written));
      // The summary line on stderr names nothing from the input, and neither sequence is there.
      expect(COMMAND.test(toFile.err), format).toBe(false);
    }
  });
  it("writes none in a notice, a refusal, or a refusal's list on stderr", async () => {
    // Two projects below a plain folder, named so the list's lines would start with ::.
    const root = tempDir("log-commands-two");
    for (const name of ["::warning::a ##vso[x]", "::error::b"]) {
      const dir = join(root, name);
      mkdirSync(join(dir, "Demo.SemanticModel", "definition"), { recursive: true });
      writeFileSync(join(dir, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    }
    const two = await run([root]);
    expect(two.code).toBe(2);
    expect(two.err).toContain("\\u003a:warning::a #\\u0023vso[x]");
    expect(COMMAND.test(two.err)).toBe(false);
    // A notice naming a legacy report beside a model.
    const proj = tempDir("log-commands-notice");
    mkdirSync(join(proj, "Demo.SemanticModel", "definition"), { recursive: true });
    writeFileSync(join(proj, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    mkdirSync(join(proj, "##vso[x]y.Report"));
    writeFileSync(join(proj, "##vso[x]y.Report", "report.json"), "{}");
    const notice = await run([proj, "--fail-on", "none"]);
    expect(notice.err).toContain("pbiplint: notice: #\\u0023vso[x]y.Report is stored");
    expect(COMMAND.test(notice.err)).toBe(false);
  });
});
