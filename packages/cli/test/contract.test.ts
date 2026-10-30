// The CLI's contract, as the CLI page's "What a script can rely on" section states it
// (packages/web/content/cli.md, https://pbiplint.com/cli/#contract). One test per promise, in the
// section's order, so a change that breaks one fails here. Change a promise here and on the page
// together; a new JSON field is additive and keeps the version where it is, a removed or renamed
// one raises it.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  defaultRules,
  escapeJsonControls,
  finding,
  formatJson,
  formatMessage,
  formatSarif,
  lint,
  msg,
  resolveConfig,
  type Message,
  type MessageId,
  type Rule,
} from "@pbiplint/core";
import { afterAll, describe, expect, it, vi } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { HELP } from "../src/args.js";
import { main, VERSION } from "../src/main.js";
import { severalJson } from "../src/several.js";

// VERSION as the build sets it, from the package's version (build.mjs), so this file's runs print
// what the built CLI prints and the one-project goldens compare whole. Set before main loads.
vi.hoisted(() => {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  vi.stubGlobal("__PBIPLINT_VERSION__", pkg.version);
});
afterAll(() => vi.unstubAllGlobals());

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");
const goldens = join(repo, "packages/cli/test/fixtures/one-project");

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

/** A folder holding the sample one level below it, so the run prints a notice. */
function sampleBelow(): string {
  const root = tempDir("contract-below");
  cpSync(sample, join(root, "sub", "messy-sales"), { recursive: true });
  return root;
}

/** A folder holding two copies of the sample, Finance and Sales, so one run lints both (#237). */
function severalProjects(): string {
  const root = tempDir("contract-several");
  for (const name of ["Finance", "Sales"]) cpSync(sample, join(root, name), { recursive: true });
  return root;
}

/**
 * #236's monorepo, from copies of the sample: reports/Finance/Finance.pbip and
 * reports/Sales/Sales.pbip, each reading models/Shared.SemanticModel by path, so Sales's run says
 * in a notice that the model is shared, and Old, a model stored as model.bim, which cannot be read.
 */
function sharedModel(): string {
  const root = tempDir("contract-shared");
  cpSync(
    join(sample, "Messy Sales Demo.SemanticModel"),
    join(root, "models", "Shared.SemanticModel"),
    {
      recursive: true,
    },
  );
  for (const name of ["Finance", "Sales"]) {
    const dir = join(root, "reports", name);
    cpSync(join(sample, "Messy Sales Demo.Report"), join(dir, `${name}.Report`), {
      recursive: true,
    });
    writeFileSync(
      join(dir, `${name}.pbip`),
      JSON.stringify({ version: "1.0", artifacts: [{ report: { path: `${name}.Report` } }] }),
    );
    writeFileSync(
      join(dir, `${name}.Report`, "definition.pbir"),
      JSON.stringify({
        version: "4.0",
        datasetReference: { byPath: { path: "../../../models/Shared.SemanticModel" } },
      }),
    );
  }
  mkdirSync(join(root, "Old", "Old.SemanticModel"), { recursive: true });
  writeFileSync(join(root, "Old", "Old.SemanticModel", "model.bim"), "{}");
  return root;
}

/**
 * A made-up rule with one finding on the model, its detail a message when `withMessage`, else the
 * same English as plain text, so the two runs' output differs by the message fields alone.
 */
function messageRule(withMessage: boolean): Rule {
  return {
    id: "MESSAGE_RULE",
    name: "A rule with messages",
    category: "Maintenance",
    severity: 2,
    scope: ["Model"],
    layer: "model",
    needs: ["model"],
    description: "Made up.",
    references: [],
    status: "builtin",
    check: ({ model }) => [
      withMessage
        ? { ...finding.model(model!), message: msg("context.table", { table: "'Sales'" }) }
        : { ...finding.model(model!), detail: "table 'Sales'" },
    ],
  };
}

/**
 * A JSON (version 1) or SARIF document without the message fields #98 added from 0.3.2: each
 * finding's `messageId` and `params`, and each SARIF result's `properties` of the same two, written
 * back as the CLI writes it, so what is left compares byte for byte with 0.3.0's output.
 */
function withoutMessages(text: string): string {
  const doc = JSON.parse(text);
  for (const g of doc.groups ?? [])
    for (const f of g.findings) {
      delete f.messageId;
      delete f.params;
    }
  for (const r of doc.runs ?? [])
    for (const res of r.results) {
      if (res.properties === undefined) continue;
      delete res.properties.messageId;
      delete res.properties.params;
      if (Object.keys(res.properties).length === 0) delete res.properties;
    }
  return escapeJsonControls(JSON.stringify(doc, null, 2)) + "\n";
}

/** The keys of an object, sorted. */
const keys = (o: object): string[] => Object.keys(o).sort();

/** Every key is one of `required` or `optional`, and every required key is there. */
function hasFields(o: object, required: string[], optional: string[] = []): void {
  expect(keys(o).filter((k) => !required.includes(k) && !optional.includes(k))).toEqual([]);
  expect(required.filter((k) => !(k in o))).toEqual([]);
}

describe("the CLI's contract", () => {
  it("0. a one-project run prints byte for byte what release/0.3.0 printed (#237)", async () => {
    const golden = (file: string): string => readFileSync(join(goldens, file), "utf8");
    // The goldens are release/0.3.0's output and are never re-recorded (fixtures/one-project/
    // README.md), so they hold version 0.3.0 where the tool names itself: the JSON's tool.version,
    // and SARIF's driver fullName and version. Those, and nothing else, take this build's version.
    const recorded = JSON.parse(golden("sample-json.out")).tool.version;
    expect(recorded).toBe("0.3.0");
    const versioned = (s: string): string =>
      s
        .replaceAll(`"version": "${recorded}"`, `"version": "${VERSION}"`)
        .replaceAll(`"fullName": "pbiplint ${recorded}"`, `"fullName": "pbiplint ${VERSION}"`);
    const cases: { name: string; argv: string[]; code: number; file?: string }[] = JSON.parse(
      golden("cases.json"),
    );
    expect(cases.length).toBe(14);
    for (const c of cases) {
      // Each case has fresh folders, as it was recorded with.
      const tmp = c.name.startsWith("below-") ? sampleBelow() : "<TMP>";
      const out = tempDir("contract-golden-out");
      const fill = (s: string): string =>
        versioned(s)
          .replaceAll("<TMPREL>", relative(repo, tmp))
          .replaceAll("<TMP>", tmp)
          .replaceAll("<OUT>", out);
      const r = await run(c.argv.map(fill));
      // From 0.3.2 a JSON or SARIF finding may carry a message id and its parameters (#98), which
      // 0.3.0 did not write. Those fields are stripped before the comparison and nothing else is,
      // and stripping the golden itself must give it back unchanged, so the rest still compares
      // byte for byte. Test 0a shows the strip leaves exactly the output without messages.
      const expected = fill(golden(`${c.name}.out`));
      if (/-(json|sarif)$/.test(c.name)) {
        expect(withoutMessages(expected), `${c.name} golden round trip`).toBe(expected);
        expect(withoutMessages(r.out), `${c.name} stdout`).toBe(expected);
      } else expect(r.out, `${c.name} stdout`).toBe(expected);
      expect(r.err, `${c.name} stderr`).toBe(fill(golden(`${c.name}.err`)));
      expect(r.code, `${c.name} exit code`).toBe(c.code);
      expect(String(r.code), `${c.name} exit code`).toBe(golden(`${c.name}.code`).trim());
      if (c.file)
        expect(readFileSync(join(out, "report.txt"), "utf8"), `${c.name} file`).toBe(
          fill(golden(c.file)),
        );
    }
  });

  it("0a. stripping the message fields gives back the document as it was without them (#98)", async () => {
    const files = [{ path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" }];
    const [withMessage, without] = await Promise.all(
      [true, false].map((m) => lint(files, { rules: [messageRule(m)] })),
    );
    const json = formatJson(withMessage!);
    const sarif = formatSarif(withMessage!);
    expect(json).toContain('"messageId": "context.table"');
    expect(sarif).toContain('"messageId": "context.table"');
    expect(withoutMessages(json)).toBe(formatJson(without!));
    expect(withoutMessages(sarif)).toBe(formatSarif(without!));
  });

  it("1. stdout carries exactly one document in json, sarif, and markdown; the rest goes to stderr", async () => {
    const below = sampleBelow();
    for (const format of ["json", "sarif"]) {
      const r = await run([below, "--format", format]);
      expect(() => JSON.parse(r.out), format).not.toThrow();
      expect(r.out.endsWith("}\n"), format).toBe(true);
      expect(r.err, format).toMatch(/^pbiplint: notice: /);
    }
    const md = await run([below, "--format", "markdown"]);
    expect(md.out.startsWith("# pbiplint report")).toBe(true);
    expect(md.out).not.toContain("pbiplint: notice:");
    expect(md.err).toMatch(/^pbiplint: notice: /);
    // The text format lists the notice in its report as well as on stderr.
    const text = await run([below]);
    expect(text.out).toMatch(/^Notice: /m);
    expect(text.err).toMatch(/^pbiplint: notice: /);
    // A config's unknown rule id goes to stderr and leaves the document whole.
    const config = join(tempDir("contract-config"), "pbiplint.config.json");
    writeFileSync(config, JSON.stringify({ rules: { NO_SUCH_RULE: "off" } }));
    const unknown = await run([below, "--format", "json", "--config", config]);
    expect(() => JSON.parse(unknown.out)).not.toThrow();
    expect(unknown.err).toContain('no rule named "NO_SUCH_RULE"');
    const explained = await run(["explain", "HIDE_FOREIGN_KEYS", "--format", "json"]);
    expect(() => JSON.parse(explained.out)).not.toThrow();
    expect(explained.err).toBe("");
    // With --output, stdout is empty and the one-line summary is on stderr.
    const dir = tempDir("contract-output");
    const written = await run([sample, "--format", "json", "--output", "r.json"], dir);
    expect(written.out).toBe("");
    expect(written.err).toMatch(/^pbiplint: 280 findings .*, wrote r\.json\n$/);
    expect(() => JSON.parse(readFileSync(join(dir, "r.json"), "utf8"))).not.toThrow();
  });

  it("1a. in a run over several projects, each notice names its project first (from 0.3.0)", async () => {
    const r = await run([sharedModel(), "--format", "json"]);
    const notices = r.err.split("\n").filter((l) => l.startsWith("pbiplint: notice: "));
    expect(notices.length).toBeGreaterThan(0);
    const paths = (JSON.parse(r.out).projects as { path: string }[]).map((p) => p.path);
    for (const l of notices)
      expect(
        paths.some((p) => l.startsWith(`pbiplint: notice: ${p}: `)),
        l,
      ).toBe(true);
    expect(notices).toContainEqual(
      expect.stringMatching(/^pbiplint: notice: reports\/Sales\/Sales\.pbip: the model at /),
    );
  });

  it("2. exits 0 when nothing reaches --fail-on, 1 when something does, and 2 for each refusal", async () => {
    expect((await run([sample])).code).toBe(1);
    expect((await run([sample, "--fail-on", "none"])).code).toBe(0);
    const warning = defaultRules.find((r) => r.id === "HIDE_FOREIGN_KEYS")!;
    expect(warning.severity).toBe(2);
    // With --rule, the gate counts only the findings shown.
    expect((await run([sample, "--rule", warning.id])).code).toBe(0);
    for (const argv of [["rules"], ["explain", warning.id], ["skill"], ["--help"], ["--version"]])
      expect((await run(argv)).code, argv.join(" ")).toBe(0);

    const dir = tempDir("contract-exit-2");
    writeFileSync(join(dir, "array.json"), "[]");
    writeFileSync(join(dir, "Sales.pbix"), "");
    mkdirSync(join(dir, "Empty.SemanticModel", "definition"), { recursive: true });
    mkdirSync(join(dir, "legacy", "Demo.Report"), { recursive: true });
    writeFileSync(join(dir, "legacy", "Demo.Report", "report.json"), "{}");
    for (const at of ["a", "b"]) {
      mkdirSync(join(dir, "none", at, "Old.SemanticModel"), { recursive: true });
      writeFileSync(join(dir, "none", at, "Old.SemanticModel", "model.bim"), "{}");
    }
    for (let i = 0; i <= 200; i++) {
      const def = join(dir, "many", `m${i}.SemanticModel`, "definition");
      mkdirSync(def, { recursive: true });
      writeFileSync(join(def, "model.tmdl"), "model Model\n");
    }
    // A skill copy that differs from the one --install would write, in its own folder.
    const skillDir = join(dir, "skill-differs");
    mkdirSync(join(skillDir, ".claude/skills/pbiplint"), { recursive: true });
    writeFileSync(join(skillDir, ".claude/skills/pbiplint/SKILL.md"), "an edited copy\n");
    const refusals: [string, string[], string?][] = [
      ["an unknown option", [sample, "--bogus"]],
      ["a missing value", [sample, "--format"]],
      ["an unknown rule id for explain", ["explain", "NO_SUCH_RULE"]],
      ["an unknown rule id for --rule", [sample, "--rule", "NO_SUCH_RULE"]],
      ["--quiet with another format", [sample, "--quiet", "--format", "json"]],
      ["a config file it cannot use", [sample, "--config", join(dir, "array.json")]],
      ["a path that is not there", [join(dir, "nope")]],
      ["a .pbix", [join(dir, "Sales.pbix")]],
      ["a model folder with no .tmdl files", [join(dir, "Empty.SemanticModel")]],
      ["a run that reads nothing it can lint", [join(dir, "legacy")]],
      ["a folder holding several projects, none of which it can read", [join(dir, "none")]],
      ["a folder holding more than 200 projects", [join(dir, "many")]],
      ["options with no path", ["--format", "json"]],
      ["an unexpected error", ["a\u0000b"]],
      ["a skill copy that differs, without --force", ["skill", "--install", "claude"], skillDir],
    ];
    for (const [what, argv, cwd] of refusals) {
      const r = await run(argv, cwd);
      expect(r.code, what).toBe(2);
      expect(r.out, what).toBe("");
      expect(r.err, what).toMatch(/^pbiplint: /);
    }
  });

  it("2a. in a run over several projects, a project it cannot read is a PARSE_ISSUE error, and the gate counts it (from 0.3.0)", async () => {
    const root = severalProjects();
    mkdirSync(join(root, "Old", "Old.SemanticModel"), { recursive: true });
    writeFileSync(join(root, "Old", "Old.SemanticModel", "model.bim"), "{}");
    const r = await run([root, "--format", "json", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.projects.map((p: { path: string }) => p.path)).toEqual([
      "Finance",
      "Old/Old.SemanticModel",
      "Sales",
    ]);
    const old = doc.projects[1];
    expect(old.groups.map((g: { rule: { id: string; severity: number } }) => g.rule)).toEqual([
      expect.objectContaining({ id: "PARSE_ISSUE", severity: 3 }),
    ]);
    // The sample's copies read whole, so under --rule PARSE_ISSUE only the unreadable project's
    // finding can reach the gate.
    const gated = await run([root, "--quiet", "--rule", "PARSE_ISSUE"]);
    expect(gated.out).toMatch(/^project Finance: 0 of \d+ findings/m);
    expect(gated.out).toMatch(/^error PARSE_ISSUE 1$/m);
    expect(gated.code).toBe(1);
    const off = join(tempDir("contract-parse-off"), "pbiplint.config.json");
    writeFileSync(off, JSON.stringify({ rules: { PARSE_ISSUE: "off" } }));
    const quiet = await run([root, "--quiet", "--rule", "PARSE_ISSUE", "--config", off]);
    expect(quiet.out).toMatch(/^project Old\/Old\.SemanticModel: 0 of 0 findings shown/m);
    expect(quiet.code).toBe(0);
  });

  it("3. the JSON document has version 1 and the fields the page lists, at every level", async () => {
    const doc = JSON.parse((await run([sampleBelow(), "--format", "json"])).out);
    hasFields(doc, ["version", "tool", "summary", "layers", "facts", "diagnostics", "groups"]);
    expect(doc.version).toBe(1);
    hasFields(doc.tool, ["name", "version"]);
    hasFields(
      doc.summary,
      [
        "files",
        "findings",
        "errors",
        "warnings",
        "infos",
        "rulesRun",
        "rulesSkipped",
        "ruleErrors",
        "ignored",
        "unknownRules",
      ],
      ["shown"],
    );
    for (const s of doc.summary.rulesSkipped) hasFields(s, ["id", "reason"]);
    hasFields(doc.layers, ["model", "report"]);
    for (const layer of Object.values(doc.layers) as { present: boolean }[])
      hasFields(layer, layer.present ? ["present", "files"] : ["present", "reason"]);
    const modelOnly = JSON.parse(
      (await run([join(sample, "Messy Sales Demo.SemanticModel"), "--format", "json"])).out,
    );
    hasFields(modelOnly.layers.report, ["present", "reason"]);
    expect(modelOnly.layers.report.present).toBe(false);
    expect(doc.summary.shown).toBeUndefined();
    expect(doc.facts.length).toBeGreaterThan(0);
    for (const f of doc.facts) hasFields(f, ["layer", "label", "value"], ["detail", "ruleId"]);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    for (const d of doc.diagnostics) hasFields(d, ["kind", "message"], ["path"]);
    for (const g of doc.groups) {
      hasFields(g, ["rule", "count", "findings"]);
      hasFields(g.rule, ["id", "name", "category", "severity", "layer", "slug", "url", "status"]);
      expect([1, 2, 3]).toContain(g.rule.severity);
      expect(g.count).toBe(g.findings.length);
      for (const f of g.findings)
        hasFields(
          f,
          ["layer", "objectType", "objectName"],
          ["objectId", "file", "line", "column", "detail", "messageId", "params"],
        );
    }
    // Groups are ranked, errors first.
    const severities = doc.groups.map((g: { rule: { severity: number } }) => g.rule.severity);
    expect(severities).toEqual([...severities].sort((a, b) => b - a));
    const filtered = JSON.parse(
      (await run([sample, "--format", "json", "--rule", "HIDE_FOREIGN_KEYS"])).out,
    );
    hasFields(filtered.summary.shown, ["rules", "findings", "errors", "warnings", "infos"]);
  });

  it("3a. a rule's layer is model, report, project, or powerquery; a finding's is model or report", async () => {
    const zoo = join(repo, "tests/fixtures/m-zoo.SemanticModel");
    const doc = JSON.parse((await run([zoo, "--format", "json", "--fail-on", "none"])).out);
    for (const g of doc.groups) {
      expect(["model", "report", "project", "powerquery"]).toContain(g.rule.layer);
      for (const f of g.findings) expect(["model", "report"]).toContain(f.layer);
    }
    const pq = doc.groups.find(
      (g: { rule: { id: string } }) => g.rule.id === "MINIMIZE_POWER_QUERY_TRANSFORMATIONS",
    );
    expect(pq.rule.layer).toBe("powerquery");
    expect(new Set(pq.findings.map((f: { layer: string }) => f.layer))).toEqual(new Set(["model"]));
  });

  it("3b. a run over several projects prints version 2: the tool, the run's summary, and each project's document with its path (from 0.3.0)", async () => {
    const root = severalProjects();
    const doc = JSON.parse((await run([root, "--format", "json"])).out);
    hasFields(doc, ["version", "tool", "summary", "projects"]);
    expect(doc.version).toBe(2);
    hasFields(doc.tool, ["name", "version"]);
    const counts = ["projects", "files", "findings", "errors", "warnings", "infos", "ignored"];
    hasFields(doc.summary, [...counts, "ruleErrors"], ["shown"]);
    expect(doc.summary.shown).toBeUndefined();
    expect(doc.summary.projects).toBe(2);
    expect(doc.projects.map((p: { path: string }) => p.path)).toEqual(["Finance", "Sales"]);
    const one = JSON.parse((await run([sample, "--format", "json"])).out);
    for (const p of doc.projects) {
      hasFields(p, ["path", "summary", "layers", "facts", "diagnostics", "groups"]);
      hasFields(p.summary, Object.keys(one.summary));
    }
    const filtered = JSON.parse(
      (await run([root, "--format", "json", "--rule", "HIDE_FOREIGN_KEYS"])).out,
    );
    hasFields(filtered.summary.shown, ["rules", "findings", "errors", "warnings", "infos"]);
    // The run's ruleErrors is a count, where each project's lists the rules.
    expect(typeof doc.summary.ruleErrors).toBe("number");
    for (const p of doc.projects) expect(Array.isArray(p.summary.ruleErrors)).toBe(true);
    const shared = JSON.parse((await run([sharedModel(), "--format", "json"])).out);
    expect(shared.projects.map((p: { path: string }) => p.path)).toEqual([
      "Old/Old.SemanticModel",
      "reports/Finance/Finance.pbip",
      "reports/Sales/Sales.pbip",
    ]);
    const [old, finance, sales] = shared.projects;
    expect(old.summary.files).toBe(0);
    expect(old.layers.model.present).toBe(false);
    expect(old.layers.report.present).toBe(false);
    // Each project that reads the shared model says so in a notice of kind shared-model.
    for (const p of [finance, sales])
      expect(p.diagnostics.map((d: { kind: string }) => d.kind)).toContain("shared-model");
  });

  it("3c. each project's findings in version 2 carry messageId and params as version 1's do (#98)", async () => {
    const config = resolveConfig({});
    const files = [{ path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" }];
    const result = await lint(files, { rules: [messageRule(true)] });
    const one = JSON.parse(formatJson(result)).groups[0].findings[0];
    expect(one).toMatchObject({ messageId: "context.table", params: { table: "'Sales'" } });
    const doc = JSON.parse(
      severalJson({ runs: [{ path: "a", result, config }], prefixes: [{}] }, VERSION),
    );
    expect(doc.projects[0].groups[0].findings[0]).toEqual(one);
  });

  it("3d. the JSON and SARIF findings carry messageId and params, which render to the detail (#98)", async () => {
    type Found = { ruleId?: string; detail?: string; messageId?: MessageId; params?: object };
    type Group = { rule: { id: string }; findings: Found[] };
    const flat = (groups: Group[]): Found[] =>
      groups.flatMap((g) => g.findings.map((f) => ({ ...f, ruleId: g.rule.id })));
    // Every finding with a message ID has its parameters, and they render back to its detail.
    const rendersBack = (findings: Found[]): void => {
      const withMessage = findings.filter((f) => f.messageId !== undefined);
      expect(withMessage.length).toBeGreaterThan(0);
      for (const f of withMessage) {
        expect(f.params, f.messageId).toBeDefined();
        expect(formatMessage(msg(f.messageId!, f.params as Message["params"])), f.ruleId).toBe(
          f.detail,
        );
      }
    };
    const json = flat(JSON.parse((await run([sample, "--format", "json"])).out).groups);
    rendersBack(json);
    // SARIF lists its results in the JSON's order: one carries the message fields exactly when
    // its finding does.
    const results: { ruleId: string; properties?: object }[] = JSON.parse(
      (await run([sample, "--format", "sarif"])).out,
    ).runs[0].results;
    expect(results.map((r) => r.ruleId)).toEqual(json.map((f) => f.ruleId));
    results.forEach((r, i) => {
      const f = json[i]!;
      expect(r.properties, f.ruleId).toEqual(
        f.messageId === undefined ? undefined : { messageId: f.messageId, params: f.params },
      );
    });
    // Version 2 holds the same inside each project's groups (Review Focus 4).
    const several = JSON.parse((await run([severalProjects(), "--format", "json"])).out);
    expect(several.projects.length).toBe(2);
    for (const p of several.projects) rendersBack(flat(p.groups));
  });

  it("4. the quiet output: the summary first, rule lines of three fields, and the Next line last", async () => {
    const lines = (await run([sampleBelow(), "--quiet"])).out.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^pbiplint: /);
    expect(lines.at(-1)).toMatch(/^Next: /);
    const ruleLines = lines.filter((l) => /^(error|warning|info) /.test(l));
    expect(ruleLines.length).toBeGreaterThan(0);
    const ids = new Set(defaultRules.map((r) => r.id));
    for (const l of ruleLines) {
      const [severity, id, count, ...rest] = l.split(" ");
      expect(rest, l).toEqual([]);
      expect(["error", "warning", "info"]).toContain(severity);
      expect(ids.has(id!), l).toBe(true);
      expect(count, l).toMatch(/^[1-9]\d*$/);
    }
    // A rule id holds no whitespace, so a rule line always splits into three fields.
    expect(defaultRules.filter((r) => /\s/.test(r.id))).toEqual([]);
  });

  it("4a. the quiet output of several projects: a line that starts `project ` opens each, its rule lines after it (from 0.3.0)", async () => {
    const lines = (await run([severalProjects(), "--quiet"])).out.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^pbiplint: 2 projects, /);
    expect(lines.at(-1)).toMatch(/^Next: /);
    const opens = lines.flatMap((l, i) => (l.startsWith("project ") ? [i] : []));
    expect(opens.map((i) => lines[i]!.split(":")[0])).toEqual(["project Finance", "project Sales"]);
    // Each project's rule lines sit between its line and the next project's.
    const rules = (from: number, to: number) =>
      lines.slice(from, to).filter((l) => /^(error|warning|info) /.test(l));
    expect(rules(opens[0]!, opens[1]!)).toEqual(rules(opens[1]!, lines.length - 1));
    expect(rules(opens[0]!, opens[1]!).length).toBeGreaterThan(0);
    expect(rules(0, opens[0]!)).toEqual([]);
  });

  it("5. explain --format json has version 1, the tool, the rule, and its sections, for every rule", async () => {
    for (const rule of defaultRules) {
      const doc = JSON.parse((await run(["explain", rule.id, "--format", "json"])).out);
      hasFields(doc, ["version", "tool", "rule", "sections"]);
      expect(doc.version).toBe(1);
      hasFields(doc.tool, ["name", "version"]);
      hasFields(doc.rule, [
        "id",
        "name",
        "category",
        "severity",
        "layer",
        "slug",
        "url",
        "status",
        "description",
      ]);
      hasFields(
        doc.sections,
        ["whyItMatters", "howToFixIt"],
        ["example", "whenToIgnoreIt", "quirks"],
      );
    }
  });

  it("6. --help states the exit codes, what stdout carries, and links the contract", () => {
    expect(HELP).toContain(
      "Exit codes: 0 no findings at or above --fail-on, 1 findings, 2 a usage error, an input it cannot read, or nothing to lint.",
    );
    expect(HELP).toContain(
      "With --format json, sarif, or markdown, stdout is one document and nothing else.",
    );
    expect(HELP).toContain(
      "Notices and errors go to stderr; the text and Markdown reports also list notices.",
    );
    expect(HELP).toContain("What a script can rely on: https://pbiplint.com/cli/#contract");
  });
});
