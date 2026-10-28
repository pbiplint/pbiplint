// A folder that holds several projects, linted in one run (#237), through main as a user runs it.
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultRules,
  formatJson,
  formatMarkdown,
  formatSarif,
  formatText,
  runSummary,
  runSummaryLine,
  summaryLine,
  type LintResult,
  type ProjectRun,
} from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { EXPLAIN_HINT, main, VERSION } from "../src/main.js";
import { QUIET_NEXT, quietText } from "../src/quiet.js";
import { lintSeveral, severalSarif, type SeveralRun } from "../src/several.js";
import { resolveInput, type NamedProject } from "../src/walk.js";

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");
const j = (v: unknown) => JSON.stringify(v);
// eslint-disable-next-line no-control-regex -- finding control characters is what this is for
const RAW_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const noLinks = process.platform === "win32";

async function run(argv: string[], cwd: string) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => cwd,
  });
  return { code, out, err };
}

/** A .pbip whose artifacts name each of `reports`, as Microsoft's pbipProperties schema has it. */
function pbipAt(file: string, reports: string[]): void {
  writeFileSync(
    file,
    j({ version: "1.0", artifacts: reports.map((path) => ({ report: { path } })) }),
  );
}

/**
 * #236's monorepo, from copies of the sample: reports/Finance/Finance.pbip and
 * reports/Sales/Sales.pbip, each reading models/Shared.SemanticModel by path, and a model of its
 * own, models/Standalone.SemanticModel, which projectsBelow lists as a project. Finance's report
 * reaches [Sales YoY %], which the sample's report does not, so only Sales reports it as not
 * reached. `sales` names the Sales report's folder.
 */
function monorepo(name: string, sales = "Sales"): string {
  const root = tempDir(name);
  const model = join(sample, "Messy Sales Demo.SemanticModel");
  cpSync(model, join(root, "models", "Shared.SemanticModel"), { recursive: true });
  cpSync(model, join(root, "models", "Standalone.SemanticModel"), { recursive: true });
  for (const name of ["Finance", sales]) {
    const dir = join(root, "reports", name);
    cpSync(join(sample, "Messy Sales Demo.Report"), join(dir, `${name}.Report`), {
      recursive: true,
    });
    pbipAt(join(dir, `${name}.pbip`), [`${name}.Report`]);
    writeFileSync(
      join(dir, `${name}.Report`, "definition.pbir"),
      j({
        version: "4.0",
        datasetReference: { byPath: { path: "../../../models/Shared.SemanticModel" } },
      }),
    );
  }
  const visual = join(
    root,
    "reports/Finance/Finance.Report/definition/pages/27f668864829019f9251/visuals/1e7f28bf49e435b68c50/visual.json",
  );
  const text = readFileSync(visual, "utf8");
  writeFileSync(visual, text.replace('"Property": "Total Sales"', '"Property": "Sales YoY %"'));
  return root;
}

const PATHS = [
  "models/Standalone.SemanticModel",
  "reports/Finance/Finance.pbip",
  "reports/Sales/Sales.pbip",
];

/** The projects of a folder that holds several. */
function named(input: string): NamedProject[] {
  const resolved = resolveInput(input);
  if (resolved.kind !== "several") throw new Error(`${input} resolved as one project`);
  return resolved.projects;
}

/** The runs main makes for the folder `root`, run from it, as `pbiplint .` makes them. */
async function runsOf(root: string, options: { rules?: string[] } = {}): Promise<SeveralRun> {
  return (await lintSeveral(root, named(root), { cwd: root, shownIds: options.rules })).run;
}

/** Every finding of a run whose rule is `id`. */
const findingsOf = (result: LintResult, id: string) =>
  result.groups.filter((g) => g.rule.id === id).flatMap((g) => g.findings);

/** Two copies of the sample, a/messy-sales and b/messy-sales, the first with no error rules. */
function secondHasErrors(): string {
  const root = tempDir("several-second");
  for (const at of ["a", "b"]) cpSync(sample, join(root, at, "messy-sales"), { recursive: true });
  const errorsOff = Object.fromEntries(
    defaultRules.filter((r) => r.severity === 3).map((r) => [r.id, "off"]),
  );
  writeFileSync(join(root, "a", "messy-sales", "pbiplint.config.json"), j({ rules: errorsOff }));
  return root;
}

/** a/Sales.SemanticModel, the sample's model, and b/Finance.SemanticModel, saved as model.bim. */
function oneUnreadable(): string {
  const root = tempDir("several-unreadable");
  cpSync(join(sample, "Messy Sales Demo.SemanticModel"), join(root, "a", "Sales.SemanticModel"), {
    recursive: true,
  });
  const legacy = join(root, "b", "Finance.SemanticModel");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "model.bim"), "{}");
  return root;
}

describe("a folder that holds several projects", () => {
  it("text: the combined summary, a line per project, each project's report, the hint once", async () => {
    const root = monorepo("several-text");
    const r = await run(["."], root);
    expect(r.code).toBe(1);
    const { runs } = await runsOf(root);
    expect(runs.map((p) => p.path)).toEqual(PATHS);
    const lines = r.out.split("\n");
    expect(lines[0]).toBe(`pbiplint: ${runSummaryLine(runSummary(runs))}`);
    expect(lines[0]).toMatch(/^pbiplint: 3 projects, \d+ findings \(/);
    // The path padded to the longest, then the counts with their numbers right-aligned.
    const counts = runs.map((p) =>
      summaryLine(p.result).replace(` in ${p.result.summary.files} files`, ""),
    );
    const pathWidth = Math.max(...PATHS.map((p) => p.length));
    const lead = (c: string) => c.indexOf(" ");
    const numberWidth = Math.max(...counts.map(lead));
    expect(lines.slice(1, 4)).toEqual(
      runs.map(
        (p, i) =>
          `  ${p.path.padEnd(pathWidth)}  ${" ".repeat(numberWidth - lead(counts[i]!))}${counts[i]}`,
      ),
    );
    expect(lines[4]).toBe("");
    for (const [i, p] of runs.entries())
      expect(r.out).toContain(`\n\nProject ${i + 1} of 3: ${p.path}\n${formatText(p.result)}\n`);
    expect(r.out.endsWith(`\n\n${EXPLAIN_HINT}\n`)).toBe(true);
    expect(r.out.split(EXPLAIN_HINT).length).toBe(2);
    expect(RAW_CONTROL.test(r.out)).toBe(false);
  });

  it("lists the shared model's findings once, under the first project, and NOT_REACHED_FROM_REPORT across reports", async () => {
    const root = monorepo("several-shared");
    const { runs } = await runsOf(root);
    const [standalone, finance, sales] = runs.map((p) => p.result);
    const modelFindings = (r: LintResult) => r.findings.filter((f) => f.layer === "model");
    expect(modelFindings(finance!).length).toBeGreaterThan(0);
    expect(modelFindings(sales!)).toEqual([]);
    expect(sales!.diagnostics.at(-1)!.message).toBe(
      "the model at models/Shared.SemanticModel is shared with reports/Finance/Finance.pbip; its findings are listed there",
    );
    // Only Sales's report leaves [Sales YoY %] unreached, so the shared model does not report it,
    // while the standalone model, which no report reads, does.
    const yoy = (r: LintResult) =>
      findingsOf(r, "NOT_REACHED_FROM_REPORT").filter((f) => f.objectName === "[Sales YoY %]");
    expect(yoy(finance!)).toEqual([]);
    expect(findingsOf(standalone!, "NOT_REACHED_FROM_REPORT")).toEqual([]);
    expect(standalone!.summary.rulesSkipped.some((s) => s.id === "NOT_REACHED_FROM_REPORT")).toBe(
      true,
    );
    // Report findings are each report's own.
    expect(findingsOf(sales!, "BROKEN_FIELD_REFERENCE").length).toBe(1);
    expect(findingsOf(finance!, "BROKEN_FIELD_REFERENCE").length).toBe(1);
    // The shared model's files count once in the combined summary.
    const summary = runSummary(runs);
    expect(summary.files).toBe(
      runs.reduce((n, p) => n + p.result.summary.files, 0) -
        (sales!.layers.model.present ? sales!.layers.model.files : 0),
    );
  });

  it("quiet: the combined line, a project line opening each project's rule lines, the Next line once", async () => {
    const root = monorepo("several-quiet");
    const r = await run([".", "--quiet"], root);
    expect(r.code).toBe(1);
    const { runs } = await runsOf(root);
    const expected = [
      `pbiplint: ${runSummaryLine(runSummary(runs))}`,
      ...runs.flatMap((p) => {
        const own = quietText(p.result).trimEnd().split("\n");
        expect(own.at(-1)).toBe(QUIET_NEXT);
        return [`project ${p.path}: ${summaryLine(p.result)}`, ...own.slice(1, -1)];
      }),
      QUIET_NEXT,
    ];
    expect(r.out).toBe(expected.join("\n") + "\n");
  });

  it("markdown: the combined sentence, a table of the projects, each project one heading down", async () => {
    const root = monorepo("several-markdown");
    const r = await run([".", "--format", "markdown"], root);
    expect(r.code).toBe(1);
    const { runs } = await runsOf(root);
    const rows = runs.map((p) => {
      const s = p.result.summary;
      return `| ${p.path} | ${s.findings} | ${s.errors} | ${s.warnings} | ${s.infos} |`;
    });
    expect(
      r.out.startsWith(
        [
          "# pbiplint report",
          "",
          `${runSummaryLine(runSummary(runs))}.`,
          "",
          "| Project | Findings | Errors | Warnings | Info |",
          "|---|---|---|---|---|",
          ...rows,
          "",
          "## Project 1 of 3: models/Standalone.SemanticModel",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
    for (const [i, p] of runs.entries()) {
      const body = formatMarkdown(p.result, { headingLevel: 2 });
      expect(body.startsWith("## pbiplint report\n")).toBe(true);
      expect(r.out).toContain(
        `## Project ${i + 1} of 3: ${p.path}\n${body.slice(body.indexOf("\n") + 1)}`,
      );
    }
    expect(r.out.endsWith("|\n")).toBe(true);
  });

  it("json: version 2, the combined summary, and each project's document with its path", async () => {
    const root = monorepo("several-json");
    const r = await run([".", "--format", "json"], root);
    expect(r.code).toBe(1);
    const { runs } = await runsOf(root);
    const doc = JSON.parse(r.out);
    expect(Object.keys(doc)).toEqual(["version", "tool", "summary", "projects"]);
    expect(doc.version).toBe(2);
    expect(doc.tool).toEqual({ name: "pbiplint", version: VERSION });
    expect(doc.summary).toEqual(runSummary(runs));
    expect(doc.projects.length).toBe(3);
    for (const [i, p] of runs.entries()) {
      const { version: _v, tool: _t, ...own } = JSON.parse(formatJson(p.result));
      expect(Object.keys(doc.projects[i])[0]).toBe("path");
      expect(doc.projects[i]).toEqual({ path: p.path, ...own });
    }
  });

  it("sarif: one run, the rules' union, each project's URIs, the shared model's results once", async () => {
    const root = monorepo("several-sarif");
    const r = await run([".", "--format", "sarif"], root);
    expect(r.code).toBe(1);
    const sarif = JSON.parse(r.out);
    expect(sarif.runs.length).toBe(1);
    const [only] = sarif.runs;
    const ids = only.tool.driver.rules.map((rule: { id: string }) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const res of only.results) expect(ids[res.ruleIndex]).toBe(res.ruleId);
    const { runs } = await runsOf(root);
    const located = (p: ProjectRun, layer: string) =>
      p.result.findings.filter((f) => f.layer === layer && f.location).length;
    const uris: string[] = only.results.flatMap(
      (res: { locations?: { physicalLocation: { artifactLocation: { uri: string } } }[] }) =>
        (res.locations ?? []).map((l) => l.physicalLocation.artifactLocation.uri),
    );
    const under = (prefix: string) => uris.filter((u) => u.startsWith(prefix)).length;
    expect(under("models/Standalone.SemanticModel/")).toBe(located(runs[0]!, "model"));
    // The shared model's results appear once: Finance's, after the shared-model step.
    expect(under("models/Shared.SemanticModel/")).toBe(located(runs[1]!, "model"));
    expect(located(runs[2]!, "model")).toBe(0);
    expect(under("reports/Finance/Finance.Report/")).toBe(located(runs[1]!, "report"));
    expect(under("reports/Sales/Sales.Report/")).toBe(located(runs[2]!, "report"));
    expect(uris.length).toBe(
      runs.reduce((n, p) => n + p.result.findings.filter((f) => f.location).length, 0),
    );
  });

  it("sarif: merges every project's notifications, and is unsuccessful when any project's is", async () => {
    const root = monorepo("several-sarif-notices");
    const { runs, prefixes } = await runsOf(root);
    const failing: ProjectRun = {
      ...runs[2]!,
      result: {
        ...runs[2]!.result,
        summary: {
          ...runs[2]!.result.summary,
          ruleErrors: [{ id: "HIDE_FOREIGN_KEYS", message: "TypeError" }],
        },
      },
    };
    const unread: ProjectRun = {
      ...runs[0]!,
      result: {
        ...runs[0]!.result,
        diagnostics: [{ kind: "unread-file", path: "x", message: "x could not be read" }],
      },
    };
    const own = (p: ProjectRun) =>
      JSON.parse(formatSarif(p.result)).runs[0].invocations[0].toolExecutionNotifications;
    const merged = (given: ProjectRun[]) =>
      JSON.parse(severalSarif({ runs: given, prefixes }, { toolVersion: VERSION, help: {} }))
        .runs[0].invocations;
    const prefixed = (p: ProjectRun) =>
      own(p).map((n: { message: { text: string } }) => ({
        ...n,
        message: { text: `${p.path}: ${n.message.text}` },
      }));
    expect(merged([unread, runs[1]!, failing])).toEqual([
      {
        executionSuccessful: false,
        toolExecutionNotifications: [...prefixed(unread), ...prefixed(failing)],
      },
    ]);
    expect(merged([unread, runs[1]!, runs[2]!])).toEqual([
      { executionSuccessful: true, toolExecutionNotifications: prefixed(unread) },
    ]);
    expect(merged(runs)).toBeUndefined();
  });

  it.skipIf(noLinks)(
    "stderr: each notice names its project; with --output the one line is the combined summary",
    async () => {
      const root = monorepo("several-stderr");
      symlinkSync(
        join(root, "reports/Sales/Sales.Report/definition/report.json"),
        join(root, "reports/Sales/Sales.Report/definition/extra.json"),
      );
      const r = await run(["."], root);
      const { runs } = await runsOf(root);
      expect(r.err).toBe(
        runs
          .flatMap((p) =>
            p.result.diagnostics.map((d) => `pbiplint: notice: ${p.path}: ${d.message}\n`),
          )
          .join(""),
      );
      expect(r.err).toContain(
        "pbiplint: notice: reports/Sales/Sales.pbip: Sales.Report/definition/extra.json is a symbolic link",
      );
      expect(r.err).toContain(
        "pbiplint: notice: reports/Sales/Sales.pbip: the model at models/Shared.SemanticModel is shared with reports/Finance/Finance.pbip; its findings are listed there\n",
      );
      const written = await run([".", "--format", "markdown", "--output", "out.md"], root);
      expect(written.out).toBe("");
      expect(written.err).toBe(
        `pbiplint: ${runSummaryLine(runSummary(runs))}, wrote out.md\n` + r.err,
      );
      expect(written.err).toMatch(/^pbiplint: 3 projects, .*, wrote out\.md\n/);
      expect(readFileSync(join(root, "out.md"), "utf8")).toBe(
        (await run([".", "--format", "markdown"], root)).out,
      );
      // SARIF carries the unread file as a notification on that project.
      const sarif = JSON.parse((await run([".", "--format", "sarif"], root)).out);
      expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(true);
      expect(sarif.runs[0].invocations[0].toolExecutionNotifications).toEqual([
        {
          level: "warning",
          descriptor: { id: "unread-file" },
          message: {
            text: `reports/Sales/Sales.pbip: ${runs[2]!.result.diagnostics.find((d) => d.kind === "unread-file")!.message}`,
          },
        },
      ]);
    },
  );

  it("names a config's unknown rule id once, however many projects use it", async () => {
    const root = monorepo("several-unknown");
    writeFileSync(join(root, "pbiplint.config.json"), j({ rules: { NO_SUCH_RULE: "off" } }));
    const r = await run(["."], root);
    const line =
      'pbiplint: pbiplint.config.json: no rule named "NO_SUCH_RULE" (run pbiplint rules for the list)\n';
    expect(r.err.split(line).length).toBe(2);
    // A config in another folder is named by its path from where the run is.
    writeFileSync(
      join(root, "reports", "Sales", "pbiplint.config.json"),
      j({ rules: { OTHER_RULE: "off" } }),
    );
    const two = await run(["."], root);
    expect(two.err.split(line).length).toBe(2);
    expect(two.err).toContain(
      'pbiplint: reports/Sales/pbiplint.config.json: no rule named "OTHER_RULE" (run pbiplint rules for the list)\n',
    );
    // A project that could not be read, first in the run, does not keep the config's ids unnamed.
    const legacy = tempDir("several-unknown-legacy");
    mkdirSync(join(legacy, "a", "Old.SemanticModel"), { recursive: true });
    writeFileSync(join(legacy, "a", "Old.SemanticModel", "model.bim"), "{}");
    cpSync(
      join(sample, "Messy Sales Demo.SemanticModel"),
      join(legacy, "b", "Sales.SemanticModel"),
      {
        recursive: true,
      },
    );
    writeFileSync(join(legacy, "pbiplint.config.json"), j({ rules: { NO_SUCH_RULE: "off" } }));
    expect((await run(["."], legacy)).err.split(line).length).toBe(2);
  });

  it("exits 1 when only the second project has an error, and 0 with --fail-on none", async () => {
    const root = secondHasErrors();
    const r = await run([".", "--format", "json"], root);
    expect(r.code).toBe(1);
    const doc = JSON.parse(r.out);
    expect(doc.projects.map((p: { path: string }) => p.path)).toEqual([
      "a/messy-sales",
      "b/messy-sales",
    ]);
    expect(doc.projects[0].summary.errors).toBe(0);
    expect(doc.projects[1].summary.errors).toBeGreaterThan(0);
    expect((await run([".", "--fail-on", "none"], root)).code).toBe(0);
    // With the second project's errors off too, nothing fails.
    cpSync(
      join(root, "a", "messy-sales", "pbiplint.config.json"),
      join(root, "b", "messy-sales", "pbiplint.config.json"),
    );
    expect((await run(["."], root)).code).toBe(0);
  });

  it("--rule keeps each project to the rule, and the combined line counts what is shown", async () => {
    const root = monorepo("several-rule");
    const r = await run([".", "--rule", "BROKEN_FIELD_REFERENCE"], root);
    expect(r.code).toBe(1);
    const { runs } = await runsOf(root, { rules: ["BROKEN_FIELD_REFERENCE"] });
    const summary = runSummary(runs);
    expect(summary.shown!.findings).toBe(2);
    expect(r.out.split("\n")[0]).toBe(`pbiplint: ${runSummaryLine(summary)}`);
    expect(r.out.split("\n")[0]).toMatch(
      new RegExp(`^pbiplint: 3 projects, 2 of ${summary.findings} findings shown, 1 rule \\(`),
    );
    const doc = JSON.parse(
      (await run([".", "--rule", "BROKEN_FIELD_REFERENCE", "--format", "json"], root)).out,
    );
    expect(doc.summary.shown).toEqual(summary.shown);
    expect(
      doc.projects.map(
        (p: { summary: { shown: { findings: number } } }) => p.summary.shown.findings,
      ),
    ).toEqual([0, 1, 1]);
    // The whole-run totals are exact: the shared model's findings count once, as without --rule.
    expect(summary.findings).toBe(runSummary((await runsOf(root)).runs).findings);
    const md = (await run([".", "--rule", "BROKEN_FIELD_REFERENCE", "--format", "markdown"], root))
      .out;
    expect(md).toContain(
      `| reports/Sales/Sales.pbip | 1 of ${runs[2]!.result.summary.findings} | 1 | 0 | 0 |`,
    );
  });

  it("a project's own config applies to it alone, and --config to every project", async () => {
    const root = monorepo("several-config");
    const sales = join(root, "reports", "Sales", "pbiplint.config.json");
    writeFileSync(sales, j({ rules: { BROKEN_FIELD_REFERENCE: "off" } }));
    const doc = JSON.parse((await run([".", "--format", "json"], root)).out);
    const has = (p: { groups: { rule: { id: string } }[] }) =>
      p.groups.some((g) => g.rule.id === "BROKEN_FIELD_REFERENCE");
    expect(doc.projects.map(has)).toEqual([false, true, false]);
    rmSync(sales);
    writeFileSync(join(root, "x.json"), j({ rules: { BROKEN_FIELD_REFERENCE: "off" } }));
    const all = JSON.parse((await run([".", "--format", "json", "--config", "x.json"], root)).out);
    expect(all.projects.map(has)).toEqual([false, false, false]);
    const without = JSON.parse((await run([".", "--format", "json"], root)).out);
    expect(without.projects.map(has)).toEqual([false, true, true]);
  });

  it("a project that cannot be read is its own project, with one PARSE_ISSUE, in every format", async () => {
    const root = oneUnreadable();
    const text = await run(["."], root);
    expect(text.code).toBe(1);
    const { runs } = await runsOf(root);
    expect(runs.map((p) => p.path)).toEqual(["a/Sales.SemanticModel", "b/Finance.SemanticModel"]);
    const [sales, finance] = runs.map((p) => p.result);
    expect(sales!.summary.findings).toBeGreaterThan(100);
    expect(finance!.findings).toEqual([
      expect.objectContaining({
        ruleId: "PARSE_ISSUE",
        objectName: "model.bim",
        location: { file: "model.bim", line: 1 },
        detail: expect.stringContaining("is stored as model.bim"),
      }),
    ]);
    expect(text.out).toContain(`Project 2 of 2: b/Finance.SemanticModel\n${formatText(finance!)}`);
    expect(text.out.split("\n")[2]).toBe(
      "  b/Finance.SemanticModel    1 finding (1 error, 0 warnings, 0 info)",
    );
    const quiet = (await run([".", "--quiet"], root)).out;
    expect(quiet).toContain(`project b/Finance.SemanticModel: ${summaryLine(finance!)}\n`);
    expect(quiet).toContain("\nerror PARSE_ISSUE 1\n");
    const md = (await run([".", "--format", "markdown"], root)).out;
    expect(md).toContain("| b/Finance.SemanticModel | 1 | 1 | 0 | 0 |");
    expect(md).toContain("## Project 2 of 2: b/Finance.SemanticModel\n");
    const doc = JSON.parse((await run([".", "--format", "json"], root)).out);
    expect(doc.projects[1].groups.map((g: { rule: { id: string } }) => g.rule.id)).toEqual([
      "PARSE_ISSUE",
    ]);
    const sarif = JSON.parse((await run([".", "--format", "sarif"], root)).out);
    const parse = sarif.runs[0].results.filter((res: { message: { text: string } }) =>
      res.message.text.startsWith("model.bim:"),
    );
    expect(parse.length).toBe(1);
    expect(parse[0].ruleId).toBe("PARSE_ISSUE");
    expect(parse[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: "b/Finance.SemanticModel/model.bim" },
      region: { startLine: 1 },
    });
    expect((await run([".", "--fail-on", "none"], root)).code).toBe(0);
  });

  it("refuses a folder none of whose projects can be read, printing nothing on stdout", async () => {
    const root = tempDir("several-none");
    mkdirSync(join(root, "a", "Empty.SemanticModel"), { recursive: true });
    const legacy = join(root, "b", "Finance.SemanticModel");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "model.bim"), "{}");
    const r = await run(["."], root);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/^pbiplint: /);
    expect(r.err).toContain("  b/Finance.SemanticModel: ");
    expect(r.err.endsWith("Run pbiplint --help for usage.\n")).toBe(true);
  });

  it("shows a project path's control characters in every line it reaches", async () => {
    // The Sales report's folder holds an escape sequence and a line break; it comes after
    // Finance in name order, so it carries the shared-model notice.
    const name = "Sa\u001b[2J\nles";
    const root = monorepo("several-controls", name);
    const shown = "reports/Sa\\u001b[2J\\u000ales/Sa\\u001b[2J\\u000ales.pbip";
    const text = await run(["."], root);
    expect(RAW_CONTROL.test(text.out)).toBe(false);
    expect(RAW_CONTROL.test(text.err)).toBe(false);
    expect(text.out.split("\n")[3]).toMatch(new RegExp(`^  ${shown.replace(/[\\[.]/g, "\\$&")}  `));
    expect(text.out).toContain(`\nProject 3 of 3: ${shown}\n`);
    expect(text.err).toContain(`pbiplint: notice: ${shown}: the model at`);
    const quiet = await run([".", "--quiet"], root);
    expect(RAW_CONTROL.test(quiet.out)).toBe(false);
    expect(quiet.out).toContain(`\nproject ${shown}: `);
    const md = await run([".", "--format", "markdown"], root);
    expect(RAW_CONTROL.test(md.out)).toBe(false);
    expect(md.out).toContain(
      "\n## Project 3 of 3: reports/Sa\\u001b\\[2J\\u000ales/Sa\\u001b\\[2J\\u000ales.pbip\n",
    );
    // A table cell shows a line break as a space, as the format's own cells do.
    expect(md.out).toContain("\n| reports/Sa\\u001b\\[2J les/Sa\\u001b\\[2J les.pbip | ");
  });
});
