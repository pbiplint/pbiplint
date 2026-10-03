// The CLI's contract, as the CLI page's "What a script can rely on" section states it
// (packages/web/content/cli.md, https://pbiplint.com/cli/#contract). One test per promise, in the
// section's order, so a change that breaks one fails here. Change a promise here and on the page
// together; a new JSON field is additive and keeps version 1, a removed or renamed one raises it.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRules } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { HELP } from "../src/args.js";
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

/** A folder holding the sample one level below it, so the run prints a notice. */
function sampleBelow(): string {
  const root = tempDir("contract-below");
  cpSync(sample, join(root, "sub", "messy-sales"), { recursive: true });
  return root;
}

/** The keys of an object, sorted. */
const keys = (o: object): string[] => Object.keys(o).sort();

/** Every key is one of `required` or `optional`, and every required key is there. */
function hasFields(o: object, required: string[], optional: string[] = []): void {
  expect(keys(o).filter((k) => !required.includes(k) && !optional.includes(k))).toEqual([]);
  expect(required.filter((k) => !(k in o))).toEqual([]);
}

describe("the CLI's contract", () => {
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
    const explained = await run(["explain", "HIDE_FOREIGN_KEYS", "--format", "json"]);
    expect(() => JSON.parse(explained.out)).not.toThrow();
    expect(explained.err).toBe("");
    // With --output, stdout is empty and the one-line summary is on stderr.
    const dir = tempDir("contract-output");
    const written = await run([sample, "--format", "json", "--output", "r.json"], dir);
    expect(written.out).toBe("");
    expect(written.err).toMatch(/^pbiplint: 266 findings .*, wrote r\.json\n$/);
    expect(() => JSON.parse(readFileSync(join(dir, "r.json"), "utf8"))).not.toThrow();
  });

  it("2. exits 0 when nothing reaches --fail-on, 1 when something does, and 2 for each refusal", async () => {
    expect((await run([sample])).code).toBe(1);
    expect((await run([sample, "--fail-on", "none"])).code).toBe(0);
    const warning = defaultRules.find((r) => r.id === "HIDE_FOREIGN_KEYS")!;
    expect(warning.severity).toBe(2);
    // With --rule, the gate counts only the findings shown.
    expect((await run([sample, "--rule", warning.id])).code).toBe(0);
    for (const argv of [["rules"], ["explain", warning.id], ["--help"], ["--version"]])
      expect((await run(argv)).code, argv.join(" ")).toBe(0);

    const dir = tempDir("contract-exit-2");
    writeFileSync(join(dir, "array.json"), "[]");
    writeFileSync(join(dir, "Sales.pbix"), "");
    mkdirSync(join(dir, "Empty.SemanticModel", "definition"), { recursive: true });
    mkdirSync(join(dir, "legacy", "Demo.Report"), { recursive: true });
    writeFileSync(join(dir, "legacy", "Demo.Report", "report.json"), "{}");
    for (const at of ["a", "b"]) cpSync(sample, join(dir, "two", at), { recursive: true });
    const refusals: [string, string[]][] = [
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
      ["a folder holding several projects", [join(dir, "two")]],
    ];
    for (const [what, argv] of refusals) {
      const r = await run(argv);
      expect(r.code, what).toBe(2);
      expect(r.out, what).toBe("");
      expect(r.err, what).toMatch(/^pbiplint: /);
    }
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
    for (const layer of Object.values(doc.layers) as object[])
      hasFields(layer, ["present"], ["files", "reason"]);
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
        hasFields(f, ["layer", "objectType", "objectName"], ["objectId", "file", "line", "detail"]);
    }
    // Groups are ranked, errors first.
    const severities = doc.groups.map((g: { rule: { severity: number } }) => g.rule.severity);
    expect(severities).toEqual([...severities].sort((a, b) => b - a));
    const filtered = JSON.parse(
      (await run([sample, "--format", "json", "--rule", "HIDE_FOREIGN_KEYS"])).out,
    );
    hasFields(filtered.summary.shown, ["rules", "findings", "errors", "warnings", "infos"]);
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
      "Notices and errors go to stderr; the text format also lists notices in its report.",
    );
    expect(HELP).toContain("What a script can rely on: https://pbiplint.com/cli/#contract");
  });
});
