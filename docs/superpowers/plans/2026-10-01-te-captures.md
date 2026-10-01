# Tabular Editor 0.7 Captures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 1 of #117 (milestone 0.2.3): every Tabular Editor capture the issue needs, committed before `te` 0.7.1.2 stops working after October 31, 2026, so pull requests 2 and 3 can be built later without `te`.

**Architecture:** `scripts/te-expectations.mjs` learns `te` 0.7's interface and gains two more kinds of capture beside Microsoft's ruleset: Tabular Editor 3's built-in rules, and the 46 published rule files the survey of September 28, 2026 found, each fetched at a pinned commit and checked against its sha256. A new hand-written fixture, `te3-zoo`, holds the shapes the later rules and deviations need. Plain Node tests check the script's pure parts and that the committed captures are complete; the existing parity suite checks pbiplint against the Microsoft capture of the new fixture.

**Tech Stack:** Node ESM scripts (`.mjs`, no build step), Vitest, ESLint and Prettier, the `te` command line (Tabular Editor CLI 0.7.1.2 at `~/.local/bin/te`), `gh` for GitHub.

**Spec:** `docs/superpowers/specs/2026-09-30-rules-beyond-bpa-design.md`, sections 1 to 3 and 7, as amended on October 1, 2026 (committed with this plan). Read it before starting any task.

## Global Constraints

- Tabular Editor is a development-time oracle only: no test runs `te`, CI never needs it, and users never do. Only the capture steps in Tasks 1, 3, and 4 run it.
- `te` 0.7.1.2 stops working after October 31, 2026, and a later build needs a license. Every capture in this plan must be merged to `main` before then. If a step that runs `te` fails, stop and report; do not hand-write a capture.
- The survey's rule files are never committed, not even in a fixture or a test: several carry no license. Only their list (`tests/expectations/survey/files.json`) and what `te` reports for them are committed.
- Microsoft's ruleset is `~/Projects/pbiplint-assets/pbip-lint-spike/ref/BPARules.json`, sha256 `ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392`. Check the sha256 before the first capture.
- The core package is untouched: this pull request changes `scripts/`, `tests/`, `docs/`, `CONTRIBUTING.md`, and `eslint.config.js` only.
- Sort with plain `.sort()`, as the existing script does, so a re-captured file keeps its order and its diff shows only what changed.
- No em dashes anywhere (code, comments, JSON strings, docs, commit messages). A hook blocks them. Restructure the sentence instead.
- Human-facing copy uses long-form dates ("October 31, 2026"); machine fields (`captured`) stay ISO. Bullets start with a capital letter. Every quote from a web page links to that page.
- Match the surrounding code: doc comments in full sentences on exported and non-obvious functions, as `scripts/fab-expectations.mjs` has them.
- Work on the branch `te3-captures` in `~/Projects/pbiplint` (not a worktree). It already holds the spec. Commit after each task. Commit messages carry `Part of #117.` and end with these two lines, after a blank line:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
  ```

  Never write a closing keyword (close, closes, fix, fixes, resolve, resolves) next to an issue number in a commit message or the pull request body. This is pull request 1 of 3; #117 stays open.
- Before each commit: `npx prettier --write <changed .mjs files>`, then `npm run lint` and the task's tests. `tests/expectations/`, `tests/fixtures/`, `*.tmdl`, and `*.md` are Prettier-ignored on purpose; never format them.
- Never edit anything under `~/Library/CloudStorage/OneDrive-McKinleyConsulting/`.
- `$SCRATCH` in the commands below is a scratch folder outside the repository (the session scratchpad). Set it once per shell: nothing in it is committed.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `scripts/te-expectations.mjs` | 1 | Runs `te` 0.7 and writes one capture per fixture, in one of four modes |
| `scripts/test/te-expectations.test.mjs` | 1 | The script's pure parts and its command line, with no `te` |
| `eslint.config.js` | 1 | Declares Node's global `fetch` for scripts |
| `tests/expectations/<six fixtures>.json` | 1 | Microsoft's ruleset, re-captured with 0.7.1.2 |
| `tests/expectations/survey/files.json` | 2 | The 46 distinct rule files, each pinned to a commit and a sha256 |
| `scripts/test/te-captures.test.mjs` | 2, 4 | The committed captures are complete and consistent |
| `tests/fixtures/te3-zoo.SemanticModel/definition/**` | 3 | The shapes pull requests 2 and 3 need |
| `tests/expectations/te3-zoo.json` | 3 | Microsoft's ruleset on te3-zoo |
| `tests/expectations/te3/<seven fixtures>.json` | 4 | Tabular Editor 3's built-in rules |
| `tests/expectations/survey/<seven fixtures>.json` | 4 | Every surveyed rule file |
| `docs/RELEASING.md`, `CONTRIBUTING.md` | 5 | Which build made each capture, what each kind is for, the commands |

The seven fixtures are the six with a Microsoft capture today (`data-sources`, `kitchen-sink`, `messy-sales`, `rule-zoo`, `tvw-baseline`, `udf-sales`) and `te3-zoo`. Each capture file's `fixture` field holds the fixture's folder; `messy-sales` is `examples/messy-sales/Messy Sales Demo.SemanticModel`, with spaces, so quote it.

What `te` 0.7.1.2 prints, measured on October 1, 2026, for reference:

- `te --version` prints the version (`0.7.1.2`) on standard output and a preview warning on standard error.
- `te bpa run -m <definition> ... --output-format json` prints one JSON object on standard output with `findings[]` (each with `code`, `object`, `objectType`, `message`), `summary`, `rulesEvaluated`, `ruleErrors` (a count), and more. It exits 1 both when it reports findings and when it fails, so the exit status says nothing; a failure is a run with no JSON on standard output and an `Error: ...` line on standard error.
- A rule `te` cannot evaluate comes back as one finding with `objectType` `BpaRule`, the rule id as `object`, and the error as `message`.
- `object` names hierarchies and levels bare (`Geography`, `Customer Name`), as pbiplint's own findings do.

---

### Task 1: The capture script learns te 0.7, with three kinds of capture

**Files:**
- Modify: `scripts/te-expectations.mjs` (replace the whole file)
- Modify: `eslint.config.js:47-53` (the block for `**/*.mjs`)
- Create: `scripts/test/te-expectations.test.mjs`
- Modify: `tests/expectations/data-sources.json`, `kitchen-sink.json`, `messy-sales.json`, `rule-zoo.json`, `tvw-baseline.json`, `udf-sales.json` (re-captured)

**Interfaces:**
- Produces (exported from `scripts/te-expectations.mjs`): `teJson(stdout: string): object`, `convertFindings(json): { findings: Record<string, string[]>, ruleErrors: Record<string, string> }`, `parseTeVersion(stdout: string): string`, `teError(stderr: string): string`, `surveyResult(run: { stdout: string, stderr: string }): { findings, ruleErrors } | { error: string }`, `checkSha256(data: Buffer, want: string, label: string): void`.
- Produces (command line): `node scripts/te-expectations.mjs <fixtureDir> <out.json> (--rules <BPARules.json> | --built-in | --survey <files.json> | --from <te.json> [--oracle <text>])`. Tasks 3 and 4 use it.
- Produces (file shapes):
  - `--rules` and `--from`: `{ fixture, oracle, captured, skipRules, [deviations, ours], [ruleErrors], findings }`, the key order of today's files. `deviations` and `ours` are written only when the existing file has `deviations`; `ruleErrors` only when `te` reported one.
  - `--built-in`: `{ fixture, oracle, captured, deviations, ours, [ruleErrors], findings }`, with `deviations` and `ours` kept from the existing file or `{}`.
  - `--survey`: `{ fixture, oracle, captured, deviations, ours, results }`, where `results` maps each file id to `{ findings, ruleErrors }` or `{ error }`.
  - Oracle strings: `Tabular Editor CLI 0.7.1.2 with BPARules.json sha256 <sha>` (`--rules`), `Tabular Editor CLI 0.7.1.2 built-in rules`, `Tabular Editor CLI 0.7.1.2, each rule file in tests/expectations/survey/files.json at its commit`. The version comes from `te --version`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/te-expectations.test.mjs`:

```js
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../tests/support/temp-dir.js";
import {
  checkSha256,
  convertFindings,
  parseTeVersion,
  surveyResult,
  teError,
  teJson,
} from "../te-expectations.mjs";

const script = fileURLToPath(new URL("../te-expectations.mjs", import.meta.url));

/** One entry of te 0.7's `bpa run` findings array. */
const finding = (code, object, objectType = "Column") => ({
  severity: "warning",
  source: "bpa",
  code,
  message: "A message.",
  object,
  objectType,
});

/** te's error for a rule file it cannot read, as it printed it for a report-rules file. */
const unreadable = [
  "Warning: Early preview expires in 30 day(s), on 2026-10-31.",
  "Warning: Failed to parse BPA rules as array: Requested value 'CustomVisual' was not found.",
  "Error: Could not parse BPA rules. Expected JSON array or object with 'rules' array.",
  "",
].join("\n");

describe("convertFindings", () => {
  it("files each object under its rule, with the rules and each rule's objects sorted", () => {
    const out = convertFindings({
      findings: [
        finding("B_RULE", "'Sales'[b]"),
        finding("A_RULE", "Model", "Model"),
        finding("B_RULE", "'Sales'[a]"),
      ],
    });
    expect(out).toEqual({
      findings: { A_RULE: ["Model"], B_RULE: ["'Sales'[a]", "'Sales'[b]"] },
      ruleErrors: {},
    });
    expect(Object.keys(out.findings)).toEqual(["A_RULE", "B_RULE"]);
  });
  it("keeps an object as many times as te reports it", () => {
    const out = convertFindings({
      findings: [finding("R", "'Legacy'", "Table"), finding("R", "'Legacy'", "Table")],
    });
    expect(out.findings).toEqual({ R: ["'Legacy'", "'Legacy'"] });
  });
  it("records a rule te could not evaluate under ruleErrors, never as a finding", () => {
    const broken = {
      ...finding("BROKEN", "BROKEN", "BpaRule"),
      severity: "error",
      message: "Value cannot be null. (Parameter 'expression')",
    };
    expect(convertFindings({ findings: [broken, finding("OK", "'Sales'", "Table")] })).toEqual({
      findings: { OK: ["'Sales'"] },
      ruleErrors: { BROKEN: "Value cannot be null. (Parameter 'expression')" },
    });
  });
  it("refuses te 0.5's JSON, which has results in place of findings", () => {
    expect(() => convertFindings({ results: [] })).toThrow(
      "no findings array: this is not te 0.7's bpa run JSON",
    );
  });
});

describe("teJson", () => {
  it("reads the JSON object after any text te printed first", () => {
    expect(teJson('Warning: preview\n{"findings":[]}')).toEqual({ findings: [] });
  });
  it("throws when te printed no JSON", () => {
    expect(() => teJson("")).toThrow("te printed no JSON");
  });
});

describe("parseTeVersion", () => {
  it("finds the version line", () => {
    expect(parseTeVersion("0.7.1.2\n")).toBe("0.7.1.2");
  });
  it("throws when no line is a version", () => {
    expect(() => parseTeVersion("Warning: Early preview expires\n")).toThrow(
      "te --version printed no version",
    );
  });
});

describe("teError and surveyResult", () => {
  it("takes te's Error line, or its whole standard error when there is none", () => {
    expect(teError(unreadable)).toBe(
      "Could not parse BPA rules. Expected JSON array or object with 'rules' array.",
    );
    expect(teError("  something else  \n")).toBe("something else");
  });
  it("gives a rule file te could not read as an error", () => {
    expect(surveyResult({ status: 1, stdout: "", stderr: unreadable })).toEqual({
      error: "Could not parse BPA rules. Expected JSON array or object with 'rules' array.",
    });
  });
  it("gives a rule file te ran as its findings and rule errors", () => {
    const stdout = JSON.stringify({ findings: [finding("R", "'Sales'", "Table")] });
    expect(surveyResult({ status: 1, stdout, stderr: "" })).toEqual({
      findings: { R: ["'Sales'"] },
      ruleErrors: {},
    });
  });
});

describe("checkSha256", () => {
  // sha256 of the three bytes "foo"
  const foo = "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
  it("passes data that matches", () => {
    expect(() => checkSha256(Buffer.from("foo"), foo, "x")).not.toThrow();
  });
  it("names the file and both checksums when the data does not match", () => {
    expect(() => checkSha256(Buffer.from("bar"), foo, "owner/repo/rules.json")).toThrow(
      /^owner\/repo\/rules\.json: sha256 [0-9a-f]{64}, expected 2c26b46b/,
    );
  });
});

describe("the command line", () => {
  const run = (args, cwd) =>
    spawnSync(process.execPath, [script, ...args], { encoding: "utf8", ...(cwd && { cwd }) });

  it("refuses no mode, two modes, or a mode without its file, before it runs anything", () => {
    for (const args of [[], ["--built-in", "--rules", "x.json"], ["--rules"], ["--survey"]]) {
      const r = run(["fixture", "out.json", ...args]);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/^usage: te-expectations/);
    }
  });
  it("converts a saved te output with --from, keeping skipRules, deviations, ours, and the oracle", () => {
    const dir = tempDir("te-expectations");
    const out = join(dir, "zoo.json");
    const saved = join(dir, "te.json");
    writeFileSync(
      out,
      JSON.stringify({
        fixture: "old",
        oracle: "Old oracle",
        captured: "2026-09-04",
        skipRules: { X: "Why it is skipped." },
        deviations: { B: "On purpose." },
        ours: { B: [] },
        findings: {},
      }),
    );
    writeFileSync(
      saved,
      `Warning: preview\n${JSON.stringify({ findings: [finding("B", "'T'[b]")] })}`,
    );
    const r = run(["fixture", out, "--from", saved], dir);
    expect(r.status, r.stderr).toBe(0);
    const written = JSON.parse(readFileSync(out, "utf8"));
    expect(Object.keys(written)).toEqual([
      "fixture",
      "oracle",
      "captured",
      "skipRules",
      "deviations",
      "ours",
      "findings",
    ]);
    expect(written).toEqual({
      fixture: "fixture",
      oracle: "Old oracle",
      captured: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      skipRules: { X: "Why it is skipped." },
      deviations: { B: "On purpose." },
      ours: { B: [] },
      findings: { B: ["'T'[b]"] },
    });
  });
  it("names te 0.7.1.2 and Microsoft's ruleset when --from has no oracle to keep", () => {
    const dir = tempDir("te-expectations");
    const saved = join(dir, "te.json");
    writeFileSync(saved, JSON.stringify({ findings: [] }));
    const r = run(["fixture", join(dir, "new.json"), "--from", saved], dir);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "new.json"), "utf8"))).toMatchObject({
      oracle:
        "Tabular Editor CLI 0.7.1.2 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392",
      skipRules: {},
      findings: {},
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run scripts/test/te-expectations.test.mjs`
Expected: FAIL. The import finds none of the six names, because today's script exports nothing.

- [ ] **Step 3: Replace the script**

Replace the whole of `scripts/te-expectations.mjs` with:

```js
#!/usr/bin/env node
// Capture Tabular Editor CLI BPA results as pbiplint expectation files, one file per fixture.
//
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --rules <BPARules.json>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --built-in
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --survey <files.json>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --from <te-output.json> [--oracle <text>]
//
// --rules runs Microsoft's ruleset, the parity oracle for the ported rules
// (tests/expectations/<fixture>.json). --built-in runs Tabular Editor 3's built-in rules
// (tests/expectations/te3/<fixture>.json). --survey runs every rule file the list names, each
// fetched at its commit and checked against its sha256 (tests/expectations/survey/<fixture>.json).
// --from converts a saved `te bpa run` JSON as --rules would. A rule te cannot evaluate is printed
// and recorded under ruleErrors, never as a finding. Keeps skipRules, deviations, and ours from an
// existing <out.json>. Tabular Editor is a development-time oracle only; see docs/RELEASING.md.
// Never run in CI.
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** The oracle a --from capture names when neither --oracle nor the existing file gives one. */
const DEFAULT_ORACLE =
  "Tabular Editor CLI 0.7.1.2 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sortedKeys = (o) =>
  Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]]),
  );

/** The JSON object in te's standard output. */
export function teJson(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("te printed no JSON");
  return JSON.parse(stdout.slice(start));
}

/**
 * te 0.7's `bpa run` JSON as `findings`, each rule id (sorted) to the sorted names of the objects
 * it reports, and `ruleErrors`, each rule te could not evaluate to te's message. te reports such a
 * rule as a finding whose object is the rule itself.
 */
export function convertFindings(json) {
  if (!Array.isArray(json.findings))
    throw new Error("no findings array: this is not te 0.7's bpa run JSON");
  const findings = {};
  const ruleErrors = {};
  for (const f of json.findings) {
    if (f.objectType === "BpaRule") ruleErrors[f.code] = f.message;
    else (findings[f.code] ??= []).push(f.object);
  }
  for (const id of Object.keys(findings)) findings[id].sort();
  return { findings: sortedKeys(findings), ruleErrors: sortedKeys(ruleErrors) };
}

/** The version line `te --version` prints, such as 0.7.1.2. */
export function parseTeVersion(stdout) {
  const version = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^\d+(\.\d+)+$/.test(line));
  if (!version) throw new Error(`te --version printed no version: ${JSON.stringify(stdout)}`);
  return version;
}

/** te's own error line from a run that printed no JSON, or its whole standard error. */
export function teError(stderr) {
  const line = stderr.split(/\r?\n/).find((l) => l.startsWith("Error: "));
  return line ? line.slice("Error: ".length).trim() : stderr.trim();
}

/** A survey file's result: its findings and rule errors, or te's error when it ran none. */
export function surveyResult(run) {
  if (!run.stdout.includes("{")) return { error: teError(run.stderr) };
  return convertFindings(teJson(run.stdout));
}

export function checkSha256(data, want, label) {
  const got = sha256(data);
  if (got !== want) throw new Error(`${label}: sha256 ${got}, expected ${want}`);
}

function te(args) {
  const run = spawnSync("te", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.error) throw new Error(`could not run te: ${run.error.message}`);
  return run; // te exits 1 when it reports findings as well as when it fails
}

/** `te bpa run` on a model folder with one rule file, or with the built-in rules when null. */
function bpaRun(definition, rules) {
  const args = ["bpa", "run", "-m", definition, "--no-model-rules", "--output-format", "json"];
  if (rules !== null) args.push("-r", rules, "--no-defaults");
  return te(args);
}

function bpaJson(run) {
  if (!run.stdout.includes("{")) throw new Error(`te failed: ${teError(run.stderr)}`);
  return teJson(run.stdout);
}

/** A rule file the survey list names, fetched at its commit and checked against its sha256. */
async function fetchRuleFile(file) {
  const path = file.path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${file.repository}/${file.commit}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file.id}: ${url} returned ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  checkSha256(body, file.sha256, file.id);
  return body;
}

function reportRuleErrors(label, ruleErrors) {
  for (const [id, message] of Object.entries(ruleErrors))
    console.error(`warning: ${label}Tabular Editor could not evaluate ${id}: ${message}`);
}

async function main() {
  const [fixtureDir, outPath, ...rest] = process.argv.slice(2);
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const modes = ["--from", "--rules", "--built-in", "--survey"].filter((m) => rest.includes(m));
  if (
    !fixtureDir ||
    !outPath ||
    modes.length !== 1 ||
    (modes[0] !== "--built-in" && !opt(modes[0]))
  ) {
    console.error(
      "usage: te-expectations <fixtureDir> <out.json> (--rules <BPARules.json> | --built-in | --survey <files.json> | --from <te.json> [--oracle <text>])",
    );
    process.exit(2);
  }
  const mode = modes[0];
  const definition = existsSync(join(fixtureDir, "definition"))
    ? join(fixtureDir, "definition")
    : fixtureDir;
  const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
  const fixture = relative(process.cwd(), fixtureDir).split("\\").join("/");
  const captured = new Date().toISOString().slice(0, 10);
  const kept = {
    deviations: previous.deviations ?? {},
    ours: previous.ours ?? {},
  };
  const version = mode === "--from" ? undefined : parseTeVersion(te(["--version"]).stdout);
  let out;
  let summary;

  if (mode === "--from" || mode === "--rules") {
    const rules = opt("--rules");
    const json =
      mode === "--from"
        ? teJson(readFileSync(opt("--from"), "utf8"))
        : bpaJson(bpaRun(definition, rules));
    const oracle =
      mode === "--from"
        ? (opt("--oracle") ?? previous.oracle ?? DEFAULT_ORACLE)
        : `Tabular Editor CLI ${version} with ${basename(rules)} sha256 ${sha256(readFileSync(rules))}`;
    const { findings, ruleErrors } = convertFindings(json);
    reportRuleErrors("", ruleErrors);
    out = {
      fixture,
      oracle,
      captured,
      skipRules: previous.skipRules ?? {},
      ...(previous.deviations && kept),
      ...(Object.keys(ruleErrors).length > 0 && { ruleErrors }),
      findings,
    };
    summary = `${Object.values(findings).flat().length} findings across ${Object.keys(findings).length} rules`;
  } else if (mode === "--built-in") {
    const { findings, ruleErrors } = convertFindings(bpaJson(bpaRun(definition, null)));
    reportRuleErrors("", ruleErrors);
    out = {
      fixture,
      oracle: `Tabular Editor CLI ${version} built-in rules`,
      captured,
      ...kept,
      ...(Object.keys(ruleErrors).length > 0 && { ruleErrors }),
      findings,
    };
    summary = `${Object.values(findings).flat().length} findings across ${Object.keys(findings).length} rules`;
  } else {
    const listPath = opt("--survey");
    const { files } = JSON.parse(readFileSync(listPath, "utf8"));
    const results = {};
    // The fetched rule files go in a folder of their own, removed however the run ends.
    const tmp = mkdtempSync(join(tmpdir(), "pbiplint-te-"));
    try {
      for (const [i, file] of files.entries()) {
        const local = join(tmp, `${i}.json`);
        writeFileSync(local, await fetchRuleFile(file));
        const result = surveyResult(bpaRun(definition, local));
        if (result.error)
          console.error(`warning: ${file.id}: Tabular Editor ran no rules: ${result.error}`);
        else reportRuleErrors(`${file.id}: `, result.ruleErrors);
        results[file.id] = result;
        console.error(
          `${i + 1}/${files.length} ${file.id}: ${result.error ? "error" : Object.values(result.findings).flat().length + " findings"}`,
        );
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    const list = relative(process.cwd(), listPath).split("\\").join("/");
    out = {
      fixture,
      oracle: `Tabular Editor CLI ${version}, each rule file in ${list} at its commit`,
      captured,
      ...kept,
      results,
    };
    summary = `${files.length} rule files`;
  }
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`${outPath}: ${summary}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
```

- [ ] **Step 4: Declare `fetch` for scripts**

In `eslint.config.js`, the block for plain Node scripts reads:

```js
  {
    // Plain Node scripts under scripts/ run on Node, not in a browser.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
```

Change it to:

```js
  {
    // Plain Node scripts under scripts/ run on Node, not in a browser. Node has had a global
    // fetch since 18; scripts/te-expectations.mjs fetches the survey's rule files with it.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", fetch: "readonly" },
    },
  },
```

- [ ] **Step 5: Run the tests and the linters**

Run: `npx prettier --write scripts/te-expectations.mjs scripts/test/te-expectations.test.mjs eslint.config.js && npx vitest run scripts/test/te-expectations.test.mjs && npm run lint`
Expected: 16 tests pass; lint and Prettier report nothing. Prettier should change nothing in the two files above, since they are written in its style.

- [ ] **Step 6: Re-capture Microsoft's ruleset with te 0.7.1.2**

First check the ruleset and the build:

```bash
shasum -a 256 ~/Projects/pbiplint-assets/pbip-lint-spike/ref/BPARules.json
te --version
```

Expected: `ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392` and `0.7.1.2` (with a preview warning on standard error).

Then, from the repository root:

```bash
RULES=~/Projects/pbiplint-assets/pbip-lint-spike/ref/BPARules.json
for name in data-sources kitchen-sink messy-sales rule-zoo tvw-baseline udf-sales; do
  dir=$(node -p "require('./tests/expectations/$name.json').fixture")
  node scripts/te-expectations.mjs "$dir" "tests/expectations/$name.json" --rules "$RULES"
done
git diff --stat tests/expectations
git diff tests/expectations | grep '^[-+] ' | grep -v '"oracle"\|"captured"'
```

Expected: the six summary lines read 8, 9, 185, 143, 183, and 196 findings (724 in all) across 4, 5, 22, 46, 21, and 24 rules, with no `warning:` line. `git diff --stat` shows 4 lines changed in each file (2 out, 2 in). The last command prints nothing: only `oracle` (now `Tabular Editor CLI 0.7.1.2 with BPARules.json sha256 ddb9cff4...`) and `captured` (today) changed, and `skipRules`, `deviations`, and `ours` are untouched.

If any finding changed, stop and report it with the diff. Do not commit a changed finding.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, including `packages/core/test/parity.test.ts` and `rule-pages.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add scripts/te-expectations.mjs scripts/test/te-expectations.test.mjs eslint.config.js tests/expectations
git commit -F - <<'EOF'
test: te-expectations.mjs runs te 0.7, and the parity captures name it

The script reads te 0.7's interface (the model in -m, findings[] with code
and object) and gains two kinds of capture beside Microsoft's ruleset:
Tabular Editor 3's built-in rules (--built-in) and the survey's rule files
(--survey), each fetched at a pinned commit and checked against its sha256.
A rule te cannot evaluate is recorded under ruleErrors, never as a finding.

The six Microsoft captures are re-captured with te 0.7.1.2: no finding
changed, only oracle and captured.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 2: The survey's list of rule files

**Files:**
- Create: `tests/expectations/survey/files.json`
- Create: `scripts/test/te-captures.test.mjs`

**Interfaces:**
- Consumes: the survey folder `.superpowers/research/2026-09-28-bpa-rule-sources/community-files/` (git-ignored, present in this checkout): `index.json` is an array of 68 `[repository, path]` pairs, and `NNN.json` is the file at index `NNN` (zero-padded to three digits).
- Produces: `tests/expectations/survey/files.json`, shaped `{ about: string, files: [{ id, repository, path, commit, sha256, rules, alsoAt: [{ repository, path }] }] }`. `id` is `<repository>/<path>` of the first place the survey found the file. Task 4's `--survey` reads it.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/te-captures.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

// What Tabular Editor CLI 0.7.1.2 captured. That build stops working after October 31, 2026, so a
// missing or partial capture cannot be made again without a licensed build (docs/RELEASING.md).
const dir = fileURLToPath(new URL("../../tests/expectations/", import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));

describe("the survey's rule files", () => {
  const { files } = read("survey/files.json");
  it("lists the 46 distinct files once each, by id and by sha256", () => {
    expect(files).toHaveLength(46);
    expect(new Set(files.map((f) => f.id)).size).toBe(46);
    expect(new Set(files.map((f) => f.sha256)).size).toBe(46);
  });
  it("pins each file to a commit and a sha256, under an id made of its repository and path", () => {
    for (const f of files) {
      expect(f.id).toBe(`${f.repository}/${f.path}`);
      expect(f.commit, f.id).toMatch(/^[0-9a-f]{40}$/);
      expect(f.sha256, f.id).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(f.rules), f.id).toBe(true);
    }
  });
  it("records the 66 places the survey found them", () => {
    expect(files.reduce((n, f) => n + 1 + f.alsoAt.length, 0)).toBe(66);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run scripts/test/te-captures.test.mjs`
Expected: FAIL with `ENOENT` for `tests/expectations/survey/files.json`.

- [ ] **Step 3: Build the list with a one-off script outside the repository**

This script reads the git-ignored survey folder and asks GitHub for commits, so it is not committed; the list it writes is, and Task 4's capture checks every entry again. Save it as `survey-files.mjs` in your scratch folder (the session scratchpad, never the repository):

```js
// One-off: builds tests/expectations/survey/files.json from the September 28, 2026 survey folder.
//   node survey-files.mjs <survey community-files folder> <out files.json>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, out] = process.argv.slice(2);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
// Two of the files carry // comment lines, which te accepts and JSON.parse does not.
const ruleCount = (text) => {
  const json = JSON.parse(text.replace(/^\uFEFF/, "").replace(/^\s*\/\/.*$/gm, ""));
  return Array.isArray(json) ? json.length : json.rules.length;
};
const gh = (path, jq) =>
  JSON.parse(execFileSync("gh", ["api", path, "--jq", jq], { encoding: "utf8" }));
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

async function resolveCommit(repository, path, want) {
  // The default branch head first, so an unchanged file is recorded at the commit the survey read;
  // then the commits that changed the file, newest first.
  const shas = [
    ...gh(`repos/${repository}/commits/HEAD`, "[.sha]"),
    ...gh(`repos/${repository}/commits?path=${encodeURIComponent(path)}&per_page=100`, "[.[].sha]"),
  ];
  for (const sha of shas) {
    const res = await fetch(`https://raw.githubusercontent.com/${repository}/${sha}/${enc(path)}`);
    if (!res.ok) continue;
    if (sha256(Buffer.from(await res.arrayBuffer())) === want) return sha;
  }
  throw new Error(`${repository}/${path}: no commit has sha256 ${want}`);
}

const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
const bySha = new Map();
index.forEach(([repository, path], i) => {
  const buf = readFileSync(join(dir, `${String(i).padStart(3, "0")}.json`));
  const sha = sha256(buf);
  const place = { repository, path };
  const entry = bySha.get(sha);
  if (!entry) bySha.set(sha, { sha, place, text: buf.toString("utf8"), others: [] });
  else if (
    ![entry.place, ...entry.others].some((p) => p.repository === repository && p.path === path)
  )
    entry.others.push(place);
});
const files = [];
for (const e of bySha.values()) {
  const commit = await resolveCommit(e.place.repository, e.place.path, e.sha);
  files.push({
    id: `${e.place.repository}/${e.place.path}`,
    repository: e.place.repository,
    path: e.place.path,
    commit,
    sha256: e.sha,
    rules: ruleCount(e.text),
    alsoAt: e.others,
  });
  console.error(
    `${files.length}/${bySha.size} ${e.place.repository}/${e.place.path} @ ${commit.slice(0, 7)}`,
  );
}
const about =
  "Rule files for Tabular Editor's Best Practice Analyzer published on GitHub, from the survey of September 28, 2026: one entry per distinct file by sha256, at the commit the capture fetches it from. The files are not committed, since several carry no license. scripts/te-expectations.mjs --survey fetches each one and checks its sha256.";
writeFileSync(out, JSON.stringify({ about, files }, null, 2) + "\n");
```

Run it from the repository root (it takes about a minute, and `gh` must be logged in; any account can read these public repositories):

```bash
mkdir -p tests/expectations/survey
node "$SCRATCH/survey-files.mjs" .superpowers/research/2026-09-28-bpa-rule-sources/community-files tests/expectations/survey/files.json
```

Expected: 46 progress lines ending `46/46 TabularEditor/BestPracticeRules/BPARules-standard-lax.json @ 98e71e1`, and no error. A repository that has gone or a file that changed since the survey shows as `no commit has sha256 ...`: stop and report it, since the file would then have to leave the list with a note.

- [ ] **Step 4: Check the list against what the spec cites**

```bash
node -e '
const { files } = require("./tests/expectations/survey/files.json");
const by = (id) => files.find((f) => f.id === id);
console.log(by("microsoft/Analysis-Services/BestPracticeRules/BPARules.json"));
console.log(by("TabularEditor/BestPracticeRules/BPARules-PowerBI.json").commit);
console.log(files.filter((f) => f.alsoAt.length).map((f) => f.id + " +" + f.alsoAt.length).join("\n"));
'
```

Expected: Microsoft's ruleset with `sha256` `ddb9cff4...392` and `rules: 71`; `BPARules-PowerBI.json` at `98e71e15fbd2a53d2e63d2b6bc3e99545461d501` (the commit spec section 5.1 cites); and the files found at more than one place, 20 extra places in all.

- [ ] **Step 5: Run the test**

Run: `npx vitest run scripts/test/te-captures.test.mjs && npm run lint`
Expected: 3 tests pass; lint clean.

- [ ] **Step 6: Commit**

```bash
git add tests/expectations/survey/files.json scripts/test/te-captures.test.mjs
git commit -F - <<'EOF'
test: the survey's 46 rule files, each pinned to a commit and a sha256

The list the survey capture runs: one entry per distinct file found
published on GitHub on September 28, 2026, at the repository's head where
the file is unchanged, with the other places the same file was found. The
files themselves stay out of the repository, since several carry no
license.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 3: The te3-zoo fixture and its Microsoft capture

**Files:**
- Create: `tests/fixtures/te3-zoo.SemanticModel/definition/database.tmdl`, `model.tmdl`, `relationships.tmdl`, `functions.tmdl`, `cultures/en-US.tmdl`, `cultures/fr-FR.tmdl`, `tables/Sales.tmdl`, `tables/Customer.tmdl`, `tables/Date.tmdl`, `tables/Budget.tmdl`, `tables/Time Intelligence.tmdl`
- Create: `tests/expectations/te3-zoo.json`

**Interfaces:**
- Consumes: `node scripts/te-expectations.mjs ... --rules` from Task 1.
- Produces: the fixture folder `tests/fixtures/te3-zoo.SemanticModel` and its Microsoft capture, which `packages/core/test/parity.test.ts` picks up by itself (it reads every `tests/expectations/*.json` that is not a `.report.json`).

What each shape is for (spec section 3.5, as amended):

| Shape | Where | For |
| --- | --- | --- |
| `fr-FR` captions most objects; leaves out `Customer` (table), `Sales[Unit Price]`, `[Order Count]`, `Geography` (hierarchy), its `Customer Name` level, and `Time Intelligence` (calculation group table); also the hidden columns and the hidden `Budget` table with its column and measure | `cultures/fr-FR.tmdl` | `NAME_WITHOUT_TRANSLATION` (pull request 3) |
| `Customer[Region]` captioned `Region`, its own name | `cultures/fr-FR.tmdl` | A caption equal to the name counts |
| Visible Decimal (`double`) and Fixed decimal (`decimal`) columns with and without a format string; a hidden one; one in a hidden table; whole-number and date columns with none | `tables/Sales.tmdl`, `tables/Budget.tmdl` | `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` (pull request 3) |
| Measures with no format string: `&` after `RETURN`, `FORMAT`, a lone string, a number, `MAXX` over a text column | `tables/Sales.tmdl` | The text-measure skip (pull request 2) |
| A calendar on `Date`, not marked as a date table, with hidden primary columns, one of them `isAvailableInMdx: false` | `tables/Date.tmdl` | The calendar deviations (pull request 2) |
| `Discount` (one word, no description) and `Pricing.WithTax` (compound, described) | `functions.tmdl` | Section 5.3's check of the UDF rules |

Every column declares its `dataType`, so #164's shape stays out. There is no culture without a `translations` block: for one, Tabular Editor reports every visible object, which would hide what `fr-FR` shows.

- [ ] **Step 1: Write the fixture files**

TMDL indents with tabs. The blocks below use four spaces per level so they survive copying; Step 2 turns every leading group of four spaces into a tab. Write each block exactly, with four spaces per level and no tabs.

`tests/fixtures/te3-zoo.SemanticModel/definition/database.tmdl`:

```tmdl
database
    compatibilityLevel: 1702
```

`model.tmdl`:

```tmdl
model Model
    culture: en-US
    defaultPowerBIDataSourceVersion: powerBI_V3
    sourceQueryCulture: en-US

annotation PBI_QueryOrder = ["Sales","Customer","Date","Budget"]

ref table Sales
ref table Customer
ref table Date
ref table Budget
ref table 'Time Intelligence'

ref cultureInfo en-US
ref cultureInfo fr-FR
```

`relationships.tmdl`:

```tmdl
relationship 5f0c2a10-0000-4000-8000-000000000001
    fromColumn: Sales.'Customer ID'
    toColumn: Customer.'Customer ID'

relationship 5f0c2a10-0000-4000-8000-000000000002
    fromColumn: Sales.'Order Date'
    toColumn: Date.Date
```

`functions.tmdl`:

```tmdl
function Discount = (price: NUMERIC, pct: DOUBLE) => price * ( 1 - pct )

/// Adds tax to a price.
function 'Pricing.WithTax' = (price: NUMERIC, rate: DOUBLE) => price * ( 1 + rate )
```

`cultures/en-US.tmdl`:

```tmdl
cultureInfo en-US

    linguisticMetadata =
            {
              "Version": "2.0.0",
              "Language": "en-US",
              "DynamicImprovement": "HighConfidence"
            }
        contentType: json
```

`cultures/fr-FR.tmdl`:

```tmdl
cultureInfo fr-FR

    translations
        model Model
            table Sales
                caption: Ventes
                measure 'Total Amount'
                    caption: Montant total
                measure 'Top Region Label'
                    caption: Libellé de la meilleure région
                measure 'Amount Text'
                    caption: Montant en texte
                measure 'Status Note'
                    caption: Note de statut
                measure 'Last Region'
                    caption: Dernière région
                column Amount
                    caption: Montant
                column 'Discount Pct'
                    caption: Pourcentage de remise
                column 'Tax Rate'
                    caption: Taux de taxe
                column Quantity
                    caption: Quantité
                column 'Ship Date'
                    caption: Date d'expédition
            table Customer
                column 'Customer Name'
                    caption: Nom du client
                column Region
                    caption: Region
                hierarchy Geography
                    level Region
                        caption: Région
            table Date
                caption: Date
                column Date
                    caption: Date
                column 'Month Name'
                    caption: Nom du mois
            table 'Time Intelligence'
                column Name
                    caption: Nom
```

`tables/Sales.tmdl`:

```tmdl
table Sales

    measure 'Total Amount' = SUM('Sales'[Amount])
        formatString: #,0.00

    measure 'Order Count' = COUNTROWS('Sales')

    measure 'Top Region Label' =
            VAR _region = MAXX(TOPN(1, VALUES('Customer'[Region]), [Total Amount]), 'Customer'[Region])
            RETURN "Top region: " & _region

    measure 'Amount Text' = FORMAT([Total Amount], "#,0")

    measure 'Status Note' = "Preliminary"

    measure 'Last Region' = MAXX('Customer', 'Customer'[Region])

    column 'Order ID'
        dataType: int64
        isHidden
        summarizeBy: none
        sourceColumn: Order ID

    column 'Customer ID'
        dataType: int64
        isHidden
        summarizeBy: none
        sourceColumn: Customer ID

    column 'Order Date'
        dataType: dateTime
        isHidden
        summarizeBy: none
        sourceColumn: Order Date

    column Amount
        dataType: decimal
        formatString: #,0.00
        summarizeBy: sum
        sourceColumn: Amount

    column 'Unit Price'
        dataType: decimal
        summarizeBy: none
        sourceColumn: Unit Price

    column 'Discount Pct'
        dataType: double
        summarizeBy: none
        sourceColumn: Discount Pct

    column 'Tax Rate'
        dataType: double
        formatString: 0.00%
        summarizeBy: none
        sourceColumn: Tax Rate

    column 'Internal Cost'
        dataType: double
        isHidden
        summarizeBy: none
        sourceColumn: Internal Cost

    column Quantity
        dataType: int64
        summarizeBy: sum
        sourceColumn: Quantity

    column 'Ship Date'
        dataType: dateTime
        summarizeBy: none
        sourceColumn: Ship Date

    partition Sales = m
        mode: import
        source =
                let
                    Source = Table.FromRows({})
                in
                    Source
```

`tables/Customer.tmdl`:

```tmdl
table Customer

    column 'Customer ID'
        dataType: int64
        isHidden
        isKey
        summarizeBy: none
        sourceColumn: Customer ID

    column 'Customer Name'
        dataType: string
        summarizeBy: none
        sourceColumn: Customer Name

    column Region
        dataType: string
        summarizeBy: none
        sourceColumn: Region

    hierarchy Geography

        level Region
            column: Region

        level 'Customer Name'
            column: 'Customer Name'

    partition Customer = m
        mode: import
        source =
                let
                    Source = Table.FromRows({})
                in
                    Source
```

`tables/Date.tmdl`:

```tmdl
table Date

    column Date
        dataType: dateTime
        summarizeBy: none
        sourceColumn: Date

    column Year
        dataType: int64
        isHidden
        summarizeBy: none
        sourceColumn: Year

    column 'Quarter Key'
        dataType: int64
        isHidden
        isAvailableInMdx: false
        summarizeBy: none
        sourceColumn: Quarter Key

    column 'Month Key'
        dataType: int64
        isHidden
        summarizeBy: none
        sourceColumn: Month Key

    column 'Month Name'
        dataType: string
        summarizeBy: none
        sourceColumn: Month Name

    calendar Gregorian

        calendarColumnGroup = year
            primaryColumn: Year

        calendarColumnGroup = quarter
            primaryColumn: 'Quarter Key'

        calendarColumnGroup = month
            primaryColumn: 'Month Key'
            associatedColumn: 'Month Name'

    partition Date = m
        mode: import
        source =
                let
                    Source = Table.FromRows({})
                in
                    Source
```

`tables/Budget.tmdl`:

```tmdl
table Budget
    isHidden

    measure 'Budget Total' = SUM('Budget'[Budget Amount])

    column 'Budget Amount'
        dataType: double
        summarizeBy: sum
        sourceColumn: Budget Amount

    partition Budget = m
        mode: import
        source =
                let
                    Source = Table.FromRows({})
                in
                    Source
```

`tables/Time Intelligence.tmdl`:

```tmdl
table 'Time Intelligence'

    calculationGroup
        precedence: 1

        calculationItem Current = SELECTEDMEASURE()

        calculationItem 'Prior Year' = CALCULATE(SELECTEDMEASURE(), SAMEPERIODLASTYEAR('Date'[Date]))

    column Name
        dataType: string
        summarizeBy: none
        sourceColumn: Name

    column Ordinal
        dataType: int64
        isHidden
        summarizeBy: none
        sourceColumn: Ordinal

    partition 'Time Intelligence' = calculationGroup
        mode: import
```

- [ ] **Step 2: Turn the indentation into tabs, and check it**

```bash
Z=tests/fixtures/te3-zoo.SemanticModel
find "$Z" -name '*.tmdl' -print0 | xargs -0 perl -pi -e 's/^((?:    )+)/"\t" x (length($1)\/4)/e'
grep -rln $'^ ' "$Z" ; echo "lines starting with a space: $(grep -rc $'^ ' "$Z" | awk -F: '{s+=$2} END {print s}')"
find "$Z" -name '*.tmdl' | sort
```

Expected: no file listed and `lines starting with a space: 0`; 11 `.tmdl` files. (The M and JSON lines keep two spaces after their tabs, which is fine: those are inside expressions.)

- [ ] **Step 3: Check that Tabular Editor and pbiplint both read it**

```bash
te list -m tests/fixtures/te3-zoo.SemanticModel/definition Tables
te list -m tests/fixtures/te3-zoo.SemanticModel/definition Cultures
te list -m tests/fixtures/te3-zoo.SemanticModel/definition Functions
```

Expected: 5 tables (Budget hidden, with 1 column and 1 measure; Customer 3 columns; Date 5; Sales 10 columns and 6 measures; Time Intelligence 2 columns); 2 cultures (en-US, fr-FR); 2 functions (`Discount` with no description, `Pricing.WithTax` with "Adds tax to a price."). Any `TmdlFormatException` or other error means a block was mistyped: compare it with Step 1.

- [ ] **Step 4: Capture Microsoft's ruleset on it**

```bash
node scripts/te-expectations.mjs tests/fixtures/te3-zoo.SemanticModel tests/expectations/te3-zoo.json --rules ~/Projects/pbiplint-assets/pbip-lint-spike/ref/BPARules.json
node -e 'const f=require("./tests/expectations/te3-zoo.json").findings; for (const id of ["ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS","MODEL_SHOULD_HAVE_A_DATE_TABLE","DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE","PROVIDE_FORMAT_STRING_FOR_MEASURES"]) console.log(id, JSON.stringify(f[id]))'
```

Expected: `tests/expectations/te3-zoo.json: 69 findings across 16 rules`, no `warning:` line, and:

```
ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS ["'Budget'[Budget Amount]","'Customer'[Customer ID]","'Date'[Month Key]","'Date'[Year]","'Sales'[Customer ID]","'Sales'[Internal Cost]","'Sales'[Order Date]","'Sales'[Order ID]","'Time Intelligence'[Ordinal]"]
MODEL_SHOULD_HAVE_A_DATE_TABLE ["Model"]
DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE ["'Date'"]
PROVIDE_FORMAT_STRING_FOR_MEASURES ["[Amount Text]","[Last Region]","[Order Count]","[Status Note]","[Top Region Label]"]
```

These four are four of the five places pull request 2's deviations will show: the calendar's `Year` and `Month Key` leave the first, `'Date'[Quarter Key]` joins `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS`, the next two pass, and three of the five measures leave the last. The fifth is `UNNECESSARY_COLUMNS`, from which the calendar's columns leave (Michael's ruling of October 1, 2026, spec section 4.2). The file has no `deviations` yet, which is right for this pull request.

- [ ] **Step 5: Run the parity suite on it**

Run: `npx vitest run packages/core/test/parity.test.ts -t te3-zoo`
Expected: PASS for every test under `parity with Tabular Editor: te3-zoo`: pbiplint reads all 11 files with no `PARSE_ISSUE`, runs every rule without errors, and matches Tabular Editor on all 66 ported model rules with no deviation (measured on a draft of this fixture on October 1, 2026).

If a ported rule differs, stop and report it with both lists: it is either a mistyped fixture or a pbiplint bug, and either way it must be understood before the capture is committed.

- [ ] **Step 6: Run the whole suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add tests/fixtures/te3-zoo.SemanticModel tests/expectations/te3-zoo.json
git commit -F - <<'EOF'
test: te3-zoo, a fixture for the rules beyond Microsoft's set

A hand-written model at compatibility level 1702 with the shapes the
coming rules and deviations need: an fr-FR translation that leaves out a
visible table, column, measure, hierarchy, level, and calculation group;
decimal columns with and without format strings; measures that return
text; a calendar on an unmarked date table; and two user-defined
functions. pbiplint matches Tabular Editor 0.7.1.2 on Microsoft's ruleset
on it, with no deviation yet.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 4: Tabular Editor 3's built-in rules and the survey's files, on every fixture

**Files:**
- Create: `tests/expectations/te3/{data-sources,kitchen-sink,messy-sales,rule-zoo,te3-zoo,tvw-baseline,udf-sales}.json`
- Create: `tests/expectations/survey/{data-sources,kitchen-sink,messy-sales,rule-zoo,te3-zoo,tvw-baseline,udf-sales}.json`
- Modify: `scripts/test/te-captures.test.mjs`

**Interfaces:**
- Consumes: `--built-in` and `--survey` from Task 1, `tests/expectations/survey/files.json` from Task 2, and the seven Microsoft captures (Tasks 1 and 3) for each fixture's folder.
- Produces: 14 capture files that pull request 3's `sourced-parity.test.ts` and custom rules (#118) will read.

- [ ] **Step 1: Write the failing test**

Replace `scripts/test/te-captures.test.mjs` with:

```js
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

// What Tabular Editor CLI 0.7.1.2 captured. That build stops working after October 31, 2026, so a
// missing or partial capture cannot be made again without a licensed build (docs/RELEASING.md).
const dir = fileURLToPath(new URL("../../tests/expectations/", import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));
/** The model fixtures with a capture in `sub`, by name. */
const names = (sub) =>
  readdirSync(join(dir, sub))
    .filter((f) => f.endsWith(".json") && !f.endsWith(".report.json") && f !== "files.json")
    .map((f) => f.slice(0, -".json".length))
    .sort();

describe("the survey's rule files", () => {
  const { files } = read("survey/files.json");
  it("lists the 46 distinct files once each, by id and by sha256", () => {
    expect(files).toHaveLength(46);
    expect(new Set(files.map((f) => f.id)).size).toBe(46);
    expect(new Set(files.map((f) => f.sha256)).size).toBe(46);
  });
  it("pins each file to a commit and a sha256, under an id made of its repository and path", () => {
    for (const f of files) {
      expect(f.id).toBe(`${f.repository}/${f.path}`);
      expect(f.commit, f.id).toMatch(/^[0-9a-f]{40}$/);
      expect(f.sha256, f.id).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(f.rules), f.id).toBe(true);
    }
  });
  it("records the 66 places the survey found them", () => {
    expect(files.reduce((n, f) => n + 1 + f.alsoAt.length, 0)).toBe(66);
  });
});

describe("the captures", () => {
  const fixtures = names("");
  const { files } = read("survey/files.json");
  it("cover every model fixture with Tabular Editor 3's built-in rules and the survey's files", () => {
    expect(fixtures).toContain("te3-zoo");
    expect(names("te3")).toEqual(fixtures);
    expect(names("survey")).toEqual(fixtures);
  });
  it.each(fixtures)("%s: all three come from te 0.7.1.2, on the same fixture", (name) => {
    const ms = read(`${name}.json`);
    for (const capture of [ms, read(`te3/${name}.json`), read(`survey/${name}.json`)]) {
      expect(capture.fixture).toBe(ms.fixture);
      expect(capture.oracle).toMatch(/^Tabular Editor CLI 0\.7\.1\.2[ ,]/);
    }
  });
  it.each(fixtures)("%s: the survey capture has a result for every listed file", (name) => {
    const { results } = read(`survey/${name}.json`);
    expect(Object.keys(results).sort()).toEqual(files.map((f) => f.id).sort());
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run scripts/test/te-captures.test.mjs`
Expected: the three survey-list tests pass; `the captures` fails with `ENOENT` for `tests/expectations/te3`.

- [ ] **Step 3: Capture the built-in rules**

```bash
mkdir -p tests/expectations/te3
for name in data-sources kitchen-sink messy-sales rule-zoo te3-zoo tvw-baseline udf-sales; do
  dir=$(node -p "require('./tests/expectations/$name.json').fixture")
  node scripts/te-expectations.mjs "$dir" "tests/expectations/te3/$name.json" --built-in
done
```

Expected: seven summary lines, no `warning:` line, and `tests/expectations/te3/te3-zoo.json: 69 findings across 15 rules`, `tests/expectations/te3/rule-zoo.json: 101 findings across 16 rules`. A `te failed:` line means the capture did not run; stop and report it.

- [ ] **Step 4: Capture the survey's files**

Each fixture takes about two minutes (46 downloads and 46 `te` runs), so run them one at a time, or the whole loop in the background, rather than under a short command timeout:

```bash
for name in data-sources kitchen-sink messy-sales rule-zoo te3-zoo tvw-baseline udf-sales; do
  dir=$(node -p "require('./tests/expectations/$name.json').fixture")
  node scripts/te-expectations.mjs "$dir" "tests/expectations/survey/$name.json" --survey tests/expectations/survey/files.json 2> "$SCRATCH/survey-$name.log"
done
grep -h 'ran no rules' "$SCRATCH"/survey-*.log | sort | uniq -c
```

Expected: seven summary lines `tests/expectations/survey/<name>.json: 46 rule files`. The last command prints one line seven times: `bonardi/PowerBI-CICD/resources/report/config/bparules.json: Tabular Editor ran no rules: Could not parse BPA rules. Expected JSON array or object with 'rules' array.` (it is a file of report rules). The logs also hold `could not evaluate` warnings for rules in about ten of the files; those are the files' own faults and are recorded under `ruleErrors`, which is the point. A `sha256 ..., expected ...` or `returned 404` error means a file moved since Task 2: stop and report it.

- [ ] **Step 5: Spot-check what pull requests 2 and 3 will lean on**

```bash
node -e '
const te3 = require("./tests/expectations/te3/te3-zoo.json").findings;
for (const id of ["TE3_BUILT_IN_FORMAT_STRING_COLUMNS", "TE3_BUILT_IN_UDF_USE_COMPOUND_NAMES", "TE3_BUILT_IN_VISIBLE_UDF_NO_DESCRIPTION", "TE3_BUILT_IN_SET_ISAVAILABLEINMDX_TRUE_NECESSARY"]) console.log(id, JSON.stringify(te3[id]));
const pbi = require("./tests/expectations/survey/te3-zoo.json").results["TabularEditor/BestPracticeRules/BPARules-PowerBI.json"];
console.log(JSON.stringify(pbi.findings.TRANSLATE_HIDEABLE_OBJECT_NAMES), JSON.stringify(pbi.findings.TRANSLATE_HIERARCHY_LEVEL_NAMES), JSON.stringify(pbi.ruleErrors));
'
```

Expected:

```
TE3_BUILT_IN_FORMAT_STRING_COLUMNS ["'Date'[Date]","'Sales'[Discount Pct]","'Sales'[Quantity]","'Sales'[Ship Date]","'Sales'[Unit Price]"]
TE3_BUILT_IN_UDF_USE_COMPOUND_NAMES ["Discount"]
TE3_BUILT_IN_VISIBLE_UDF_NO_DESCRIPTION ["Discount"]
TE3_BUILT_IN_SET_ISAVAILABLEINMDX_TRUE_NECESSARY ["'Date'[Quarter Key]"]
["'Budget'","'Customer'","'Sales'[Unit Price]","Geography","[Budget Total]","[Order Count]"] ["Customer Name"] {}
```

- [ ] **Step 6: Run the tests, check the size, and commit**

Run: `npx vitest run scripts/test/te-captures.test.mjs && npm test && du -sh tests/expectations/te3 tests/expectations/survey`
Expected: all pass; the survey folder is around 2 MB (about 220 KB for rule-zoo alone), which is the price of #118's oracle.

```bash
git add tests/expectations/te3 tests/expectations/survey scripts/test/te-captures.test.mjs
git commit -F - <<'EOF'
test: Tabular Editor 3's built-in rules and the survey's files on every fixture

Two more captures for each of the seven model fixtures, from te 0.7.1.2:
the built-in rules (the oracle for the rules pbiplint takes from them)
and the 46 published rule files (custom rules' expected results). A test
checks that every fixture has all three captures from that build and a
result for every listed file, since none can be made again after October
31, 2026 without a licensed build.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 5: The docs, the pull request, and the issues

**Files:**
- Modify: `docs/RELEASING.md` (the section `## Model parity expectations`)
- Modify: `CONTRIBUTING.md` (the section `## Refreshing parity expectations`)

- [ ] **Step 1: Rewrite RELEASING's model parity section**

In `docs/RELEASING.md`, replace everything from the line `## Model parity expectations` up to, not including, the line `## Report parity expectations` with the text below. The file wraps prose at 100 columns; keep that.

```markdown
## Model parity expectations

The model rules are pinned to the Tabular Editor 3 command line, `te`, a development-time oracle
only. The commands that refresh the captures are in CONTRIBUTING.md under "Refreshing parity
expectations".

Every capture from `te` under `tests/expectations/` was made with Tabular Editor CLI 0.7.1.2 in
October 2026, as each file's `oracle` and `captured` fields say. Each model fixture has three:

- **Microsoft's ruleset**, `tests/expectations/<fixture>.json`: the parity oracle for the ported
  rules. The six files first captured with the 0.5.2 build were re-captured with 0.7.1.2, and no
  finding changed.
- **Tabular Editor 3's built-in rules**, `tests/expectations/te3/<fixture>.json`: the oracle for
  the rules pbiplint takes from the built-in set, and a record of what the built-in rules report
  once `te` is gone.
- **The survey's rule files**, `tests/expectations/survey/<fixture>.json`: what each of the 46
  distinct rule files in `tests/expectations/survey/files.json` reports, the files a survey on
  September 28, 2026 found published on GitHub. They are the expected results for
  [custom rules](https://github.com/pbiplint/pbiplint/issues/118). The rule files themselves are
  not committed, since several carry no license: the list pins each one to a commit and a sha256,
  and the script fetches it from there and checks it.

Tabular Editor CLI 0.7.1.2 is a preview build that stops working after October 31, 2026, and the
[0.7.0 release post](https://tabulareditor.com/blog/tabular-editor-cli-0-7-0-release) (September
14, 2026) says, "After the preview period, a license will be required." So a re-capture after
October 31, 2026 needs a licensed build from the
[installation page](https://docs.tabulareditor.com/en/features/te-cli/te-cli-install.html): sign
in with a Tabular Editor account, download the build for your platform, and overwrite the old one.
The script writes the build it ran into each file's `oracle`.
```

- [ ] **Step 2: Rewrite CONTRIBUTING's section**

In `CONTRIBUTING.md`, replace everything from the line `## Refreshing parity expectations` up to, not including, the paragraph that starts `New fixtures must be sanitized` with the text below. This file keeps each paragraph on one line; keep that.

````markdown
## Refreshing parity expectations

Tabular Editor is a development-time oracle only. Users, the CLI, and CI never need it.

Each model fixture has three captures from the Tabular Editor 3 command line, `te`, which docs/RELEASING.md describes under Model parity expectations. From the repository root, for one fixture:

```bash
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/rule-zoo.json --rules /path/to/BPARules.json
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/te3/rule-zoo.json --built-in
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/survey/rule-zoo.json --survey tests/expectations/survey/files.json
```

`BPARules.json` is Microsoft's ruleset with the sha256 the files' `oracle` names. The survey capture downloads the 46 rule files from GitHub and runs `te` on each, about two minutes a fixture, and warns for every rule `te` cannot evaluate, which is expected for these files. A saved `te bpa run --output-format json` output converts with `--from <file>` in place of `--rules`.

`te` runs on Windows, macOS, and Linux. Without it, submit hand-verified expectations and say so in the pull request. Keep the `skipRules` entries and their reasons; the script keeps them from the existing file, and any `deviations` with their `ours` too.

The report rules are pinned to fab-inspector the same way; the steps are in docs/RELEASING.md under Report parity expectations. What a re-capture needs after October 31, 2026, when Tabular Editor CLI 0.7.1.2 stops working, is in the same file under Model parity expectations.
````

The old section's sentence about the Tabular Editor 2 command line goes: the script now reads only `te` 0.7's JSON, which Tabular Editor 2 does not write.

- [ ] **Step 3: Check the docs and commit**

```bash
grep -n '0\.5\.2\|0\.7\.0' docs/RELEASING.md CONTRIBUTING.md
grep -c $'\u2014' docs/RELEASING.md CONTRIBUTING.md
npm test
```

Expected: the first command prints only the RELEASING lines that name the 0.5.2 build and the 0.7.0 release post on purpose; the second prints `0` for both files; the suite passes.

```bash
git add docs/RELEASING.md CONTRIBUTING.md
git commit -F - <<'EOF'
docs: which te build made each capture, and the three capture commands

RELEASING's model parity section names Tabular Editor CLI 0.7.1.2 for
every capture, says what each of the three kinds is for, and what a
re-capture needs after October 31, 2026. CONTRIBUTING gives the three
commands.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

- [ ] **Step 4: Review the whole branch, then open the pull request**

Run the whole-branch review (superpowers:requesting-code-review, on Opus) over `main..te3-captures` and fix what it finds. Then:

```bash
git log --format=%B main..te3-captures | grep -inE '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[[:space:]]*#[0-9]+'
npm run lint && npm run typecheck && npm test
gh auth switch --user TheDataPractitioner
git push
gh pr create --base main --head te3-captures --title "test: Tabular Editor 0.7 captures for the rules beyond Microsoft's set" --body-file "$SCRATCH/pr-body.md"
gh auth switch --user michaelmckinleyconsulting
```

Expected: the grep prints nothing; everything passes. `$SCRATCH/pr-body.md` holds:

```markdown
Pull request 1 of 3 for #117: every Tabular Editor capture the issue needs, made with `te` 0.7.1.2 before that preview build stops working after October 31, 2026. Pull requests 2 (the existing rules) and 3 (the new rules) need no `te`.

- **The script.** `scripts/te-expectations.mjs` reads `te` 0.7's interface and captures three ways: Microsoft's ruleset, Tabular Editor 3's built-in rules (`--built-in`), and the survey's rule files (`--survey`), each fetched at a pinned commit and checked against its sha256. A rule `te` cannot evaluate is recorded under `ruleErrors`, never as a finding.
- **The re-capture.** The six Microsoft captures now name 0.7.1.2. No finding changed (724 in all).
- **The survey list.** `tests/expectations/survey/files.json`: 46 distinct rule files at 66 places, pinned by commit and sha256. The files are not committed, since several carry no license.
- **A new fixture**, `te3-zoo`: the shapes pull requests 2 and 3 need. pbiplint matches Tabular Editor on Microsoft's ruleset on it, with no deviation yet.
- **14 new captures**, built-in and survey, for the seven fixtures, and a test that each fixture has all three from 0.7.1.2.
- **Docs.** RELEASING's model parity section and CONTRIBUTING's commands. The plan, and the spec's amendments of October 1, 2026 from what the plan measured, come first on the branch.

No change in pbiplint's results.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
```

- [ ] **Step 5: Merge when green, then the issue bookkeeping**

When CI passes, merge with a merge commit, as the repository does, and bring local `main` up to date:

```bash
gh auth switch --user TheDataPractitioner
gh pr merge <number> --merge --delete-branch
git checkout main && git pull --ff-only
```

Then, still as TheDataPractitioner:

1. Comment on #117 under the heading the spec's section 10 names:

   ```markdown
   **For the 0.2.3 release summary** (pull request #<number>, the capture): no change in results. Every model parity expectation is now captured with Tabular Editor CLI 0.7.1.2, with no finding changed from 0.5.2, and each model fixture also has captures of Tabular Editor 3's built-in rules and of the 46 published rule files the survey found, for this issue's rules and for custom rules (#118). New fixture: `te3-zoo`.
   ```

2. Tick #117's box that starts `**Capture Tabular Editor's results by October 31, 2026,**` and #153's box that starts `**RELEASING's model parity section.**`: fetch each body with `gh issue view <n> --json body --jq .body`, change that one `- [ ]` to `- [x]`, and write it back with `gh issue edit <n> --body-file <file>`. Check the result with `gh issue view <n>` before moving on.

3. `gh auth switch --user michaelmckinleyconsulting`, so the global account is the one ContentStudio expects.

---

## Out of scope

- #164's fix, fixture, and captures (all three: Microsoft's ruleset, the built-in rules, and the survey's files) are a pull request of their own, also before October 31, 2026 (spec section 7).
- The rules, the deviations, and the pages: pull requests 2 and 3, from captures this plan commits.

## Notes for pull requests 2 and 3

Measured on a draft of te3-zoo on October 1, 2026, and checked again by Task 4 Step 5:

- Tabular Editor 3's built-in rules already read calendars: its IsAvailableInMdx rules skip `Year` and `Month Key` and report `Quarter Key`, and its date table rule is silent.
- `BPARules-PowerBI.json`'s translation rules on te3-zoo report the hidden `Budget` table and `[Budget Total]` in it. They do not report `Customer[Region]` (captioned with its own name), the `Time Intelligence` calculation group table, or `Budget[Budget Amount]` (a column in the hidden table). Spec section 5.1 records two of these as deviations: the hidden table with its measure, and the calculation group table.
- Tabular Editor 3's measure format string rule infers DAX types: it skips all four text measures, `MAXX` over a text column included, and reports `[Order Count]` and `[Budget Total]`.
- Microsoft's `UNNECESSARY_COLUMNS` reports the calendar's three hidden primary columns. Michael ruled on October 1, 2026 that a column the model or a feature needs counts as used, so pull request 2 records this as a deviation too (spec section 4.2).
- After the final review, te3-zoo gained the hidden associated column `'Date'[Month Short Name]` in the calendar's month group, so the counts in Tasks 3 and 4 predate it: Microsoft's capture now has 72 findings across 16 rules, the column joining `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS`, `MONTH_(AS_A_STRING)_MUST_BE_SORTED`, and `UNNECESSARY_COLUMNS`, and 37 of the survey's files report it under 87 rules in all, nothing else in them changing. Tabular Editor 3's built-in rules do not report it, so their capture is unchanged: the IsAvailableInMdx rule skips a hidden associated column as it skips a hidden primary one, and does report the column on a copy whose calendar leaves it out (measured October 1, 2026).
