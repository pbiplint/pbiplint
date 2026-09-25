import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

const repo = new URL("../../../", import.meta.url).pathname;
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
function pbipProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
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

describe("pbiplint CLI", () => {
  it("lints the sample project and exits 1 because it has errors", async () => {
    const r = await run([sample]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(
      /^pbiplint: 256 findings \(19 errors, 77 warnings, 160 info\) in 91 files/,
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
      // report.json saves the pane expanded; the config's policy expects it closed.
      { layer: "report", label: "Filters pane", value: "open", ruleId: "FILTERS_PANE_STATE" },
      // Scratch is hidden, and Product tooltip is a tooltip page by its type and its binding.
      {
        layer: "report",
        label: "Pages",
        value: "11",
        detail: "1 hidden, 1 tooltip",
        ruleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
      },
      // 57 visual.json files, two of them groups; two visuals hidden on Overview and two inside
      // the hidden group on Employees; report.json registers ChicletSlicer and no visual is one.
      {
        layer: "report",
        label: "Visuals",
        value: "55",
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
      // One catalog slicer, Category on Overview, which saves a selection.
      {
        layer: "report",
        label: "Slicers",
        value: "1",
        detail: "1 saved selection",
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
        detail: "37 columns and 2 measures not reached from this report",
        ruleId: "NOT_REACHED_FROM_REPORT",
      },
    ]);
  });
  it("--sample is the same as pointing at the bundled sample", async () => {
    const r = await run(["--sample", "--format", "json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).summary.findings).toBe(256);
  });
  it("--sample reads the bundled project, its model and its report, and prints no notice", async () => {
    const r = await run(["--sample", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Model: 14 files\. Report: 77 files\. /m);
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
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-out-"));
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
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-out-"));
    const r = await run([sample, "--format", "sarif", "--output", "out/report.sarif"], dir);
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe(
      "pbiplint: 256 findings (19 errors, 77 warnings, 160 info) in 91 files, wrote out/report.sarif\n",
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
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-cfg-"));
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
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-cfg-unknown-"));
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
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-cfg-array-"));
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
    expect((await run(["--help"])).out).toContain("Usage: pbiplint");
    expect((await run(["--version"])).out).toMatch(/^pbiplint \d+\.\d+\.\d+/);
    const bad = await run(["--format", "xml", sample]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--format");
    const missing = await run([join(repo, "nope")]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("does not exist");
  });
  it("lints a whole project, prints layers in JSON, and puts notices on stderr", async () => {
    const root = mkdtempSync(join(tmpdir(), "pbiplint-proj-"));
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
      "pbiplint: notice: Demo.Report is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop\n",
    );
  });
  // These tests have the operating system refuse a read, as a POSIX system does for a user (CI
  // runs them on Ubuntu). Root reads a folder whatever its mode, and Windows ignores a mode of 000
  // and makes a symbolic link only in Developer Mode or as an administrator, so they skip there.
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
      const root = pbipProject("pbiplint-locked-");
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
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(noModes)(
    "leaves out a part folder it cannot read, saying so, and lints the other part",
    async () => {
      const root = pbipProject("pbiplint-locked-part-");
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
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(onWindows)(
    "gives a notice for a directory where it reads a file, and lints the rest",
    async () => {
      // A link is how a directory reaches a file read: a real directory is walked into instead.
      const root = pbipProject("pbiplint-isdir-");
      try {
        const def = join(root, "Demo.Report", "definition");
        rmSync(join(def, "report.json"));
        symlinkSync(join(def, "pages"), join(def, "report.json"));
        const r = await run([root, "--format", "json", "--fail-on", "warning"]);
        const notice = unread(
          "Demo.Report/definition/report.json",
          "EISDIR: illegal operation on a directory",
        );
        expect(r.err).toBe(`pbiplint: notice: ${notice.message}\n`);
        expect(r.code).toBe(1);
        const doc = JSON.parse(r.out);
        expect(doc.layers.report.present).toBe(true);
        expect(doc.diagnostics).toEqual([notice]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(noModes)(
    "says a part could not be read when its definition lists but none of its files read",
    async () => {
      const root = pbipProject("pbiplint-locked-files-");
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
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(noModes)(
    "names a folder once though a part given on its own is walked for each layer",
    async () => {
      const root = pbipProject("pbiplint-locked-once-");
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
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(noModes)(
    "refuses a .pbip it was pointed at and cannot read, and notes one it found",
    async () => {
      const root = pbipProject("pbiplint-locked-pbip-");
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
        rmSync(root, { recursive: true, force: true });
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
  });
  it.skipIf(noModes)("refuses an input folder it cannot read at all, naming it", async () => {
    const root = pbipProject("pbiplint-locked-input-");
    chmodSync(root, 0o000);
    try {
      const r = await run([root]);
      expect(r.code).toBe(2);
      expect(r.err).toBe(
        `pbiplint: Could not read ${root}: EACCES: permission denied\nRun pbiplint --help for usage.\n`,
      );
    } finally {
      chmodSync(root, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.skipIf(noModes)(
    "refuses an input none of whose files could be read, rather than report no findings",
    async () => {
      const root = pbipProject("pbiplint-locked-all-");
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
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it("lists the layer of every rule", async () => {
    const r = await run(["rules"]);
    expect(r.out).toMatch(/^PARSE_ISSUE\s+project\s+builtin/m);
    expect(r.out).toMatch(/^HIDE_FOREIGN_KEYS\s+model\s+ported/m);
  });
});
