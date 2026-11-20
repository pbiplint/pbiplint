#!/usr/bin/env node
// Capture Tabular Editor CLI BPA results as pbiplint expectation files, one file per fixture.
//
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --rules <BPARules.json>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --built-in
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --survey <files.json>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --probes <dir>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --from <te-output.json> [--oracle <text>]
//
// --probes runs each rule file in <dir> (pbiplint's own probe rules, tests/rules/te-probes/), one
// te run each, into tests/expectations/custom-rules/probes/<fixture>.json: per file its sha256 and
// its findings, rule errors, te's severity label for each rule that found anything, and the rules
// that found nothing (quiet), or te's error when it refused the file.
//
// --rules runs Microsoft's ruleset, the parity oracle for the ported rules
// (tests/expectations/<fixture>.json). --built-in runs Tabular Editor 3's built-in rules
// (tests/expectations/te3/<fixture>.json). --survey runs every rule file the list names, each
// fetched at its commit and checked against its sha256 (tests/expectations/survey/<fixture>.json);
// a file GitHub no longer has (404) is recorded as unavailable, with the capture's date.
// --from converts a saved `te bpa run` JSON as --rules would. A rule te cannot evaluate is printed
// and recorded under ruleErrors, never as a finding. Keeps skipRules, deviations, ours, and custom
// (custom rules' deviations, keyed by rule file id, then rule id) from an existing <out.json>. Tabular Editor is a development-time oracle only; see docs/RELEASING.md.
// Never run in CI.
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
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

/**
 * The rule ids in a rule file, in file order, read as Tabular Editor reads the file: a byte order
 * mark and `//` and `/* *\/` comments allowed, an array or an object with a `rules` array, keys in
 * any case, and a number id written as its decimal string.
 */
export function ruleIdsOf(text) {
  let json = "";
  let inString = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      json += c;
      if (c === "\\") json += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      json += c;
    } else if (text.startsWith("//", i)) {
      while (i < text.length && text[i] !== "\n") i++;
      json += "\n";
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Error("unterminated comment");
      i = end + 1;
    } else json += c;
  }
  const parsed = JSON.parse(json);
  const rules = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed).find(([k]) => k.toLowerCase() === "rules")?.[1];
  if (!Array.isArray(rules)) throw new Error("not an array or an object with a rules array");
  return rules.map((rule) => {
    const id = Object.entries(rule).find(([k]) => k.toLowerCase() === "id")?.[1];
    return String(id);
  });
}

/**
 * A probe file's result: `surveyResult`'s findings and rule errors, te's severity label for each
 * rule that found anything, and the ids in `ruleIds` that neither found anything nor failed; or
 * te's error when it ran none.
 */
export function probeResult(run, ruleIds) {
  if (!run.stdout.includes("{")) return { error: teError(run.stderr) };
  const json = teJson(run.stdout);
  const { findings, ruleErrors } = convertFindings(json);
  const severities = {};
  for (const f of json.findings) if (f.objectType !== "BpaRule") severities[f.code] = f.severity;
  const quiet = [...new Set(ruleIds)].filter((id) => !(id in findings) && !(id in ruleErrors));
  return { findings, ruleErrors, severities: sortedKeys(severities), quiet };
}

/** Checks that `data` has the sha256 `want`, or throws naming the file (`label`) and both sums. */
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

/** Where a rule file the survey list names is, at its commit. */
function ruleFileUrl(file) {
  const path = file.path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${file.repository}/${file.commit}/${path}`;
}

/**
 * A rule file the survey list names, fetched at its commit and checked against its sha256, or null
 * when GitHub answers 404: its repository, or the commit, is no longer there.
 */
async function fetchRuleFile(file) {
  const url = ruleFileUrl(file);
  const res = await fetch(url);
  if (res.status === 404) return null;
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
  const modes = ["--from", "--rules", "--built-in", "--survey", "--probes"].filter((m) =>
    rest.includes(m),
  );
  if (
    !fixtureDir ||
    !outPath ||
    modes.length !== 1 ||
    (modes[0] !== "--built-in" && !opt(modes[0]))
  ) {
    console.error(
      "usage: te-expectations <fixtureDir> <out.json> (--rules <BPARules.json> | --built-in | --survey <files.json> | --probes <dir> | --from <te.json> [--oracle <text>])",
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
    ...(previous.custom && { custom: previous.custom }),
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
  } else if (mode === "--probes") {
    const dir = opt("--probes");
    const results = {};
    for (const name of readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const path = join(dir, name);
      const body = readFileSync(path);
      const result = probeResult(bpaRun(definition, path), ruleIdsOf(body.toString("utf8")));
      if (result.error) console.error(`${name}: Tabular Editor ran no rules: ${result.error}`);
      results[name] = { sha256: sha256(body), ...result };
    }
    out = {
      fixture,
      oracle: `Tabular Editor CLI ${version}, each probe rule file in ${relative(process.cwd(), dir).split("\\").join("/")}`,
      captured,
      results,
    };
    summary = `${Object.keys(results).length} probe files`;
  } else {
    const listPath = opt("--survey");
    const { files } = JSON.parse(readFileSync(listPath, "utf8"));
    const results = {};
    // The fetched rule files go in a folder of their own, removed however the run ends.
    const tmp = mkdtempSync(join(tmpdir(), "pbiplint-te-"));
    try {
      for (const [i, file] of files.entries()) {
        const body = await fetchRuleFile(file);
        if (body === null) {
          // Recorded, not run: no build of te can run a file that is gone.
          results[file.id] = { unavailable: `${ruleFileUrl(file)} returned 404 on ${captured}` };
          console.error(`warning: ${file.id}: GitHub no longer has it; recorded as unavailable`);
          console.error(`${i + 1}/${files.length} ${file.id}: unavailable`);
          continue;
        }
        const local = join(tmp, `${i}.json`);
        writeFileSync(local, body);
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
