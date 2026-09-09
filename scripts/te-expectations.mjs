#!/usr/bin/env node
// Convert Tabular Editor CLI BPA output into a pbiplint parity expectation file.
//
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --from <te-output.json>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --rules <BPARules.json>   (runs `te`)
//
// Keeps any existing skipRules in <out.json>. Tabular Editor is a development-time oracle only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const [fixtureDir, outPath, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (!fixtureDir || !outPath || (!opt("--from") && !opt("--rules"))) {
  console.error(
    "usage: te-expectations <fixtureDir> <out.json> (--from <te.json> | --rules <BPARules.json>) [--oracle <text>]",
  );
  process.exit(2);
}

let raw;
if (opt("--from")) {
  raw = readFileSync(opt("--from"), "utf8");
} else {
  const definition = existsSync(join(fixtureDir, "definition"))
    ? join(fixtureDir, "definition")
    : fixtureDir;
  const run = spawnSync(
    "te",
    [
      "bpa",
      "run",
      definition,
      "-r",
      opt("--rules"),
      "--no-defaults",
      "--no-model-rules",
      "--output-format",
      "json",
    ],
    { encoding: "utf8" },
  );
  if (run.error) {
    console.error(`could not run te: ${run.error.message}`);
    process.exit(2);
  }
  raw = run.stdout; // te exits 1 when error-level violations exist; that is not a failure here
}
const json = JSON.parse(raw.slice(raw.indexOf("{")));
if (json.ruleErrors)
  console.error(`warning: Tabular Editor reported ${json.ruleErrors} rule error(s)`);

const findings = {};
for (const r of json.results) (findings[r.ruleId] ??= []).push(r.objectName);
for (const id of Object.keys(findings)) findings[id].sort();
const sorted = Object.fromEntries(
  Object.keys(findings)
    .sort()
    .map((id) => [id, findings[id]]),
);

const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
const out = {
  fixture: relative(process.cwd(), fixtureDir).split("\\").join("/"),
  oracle:
    opt("--oracle") ??
    previous.oracle ??
    "Tabular Editor CLI 0.5.2.11639 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392",
  captured: new Date().toISOString().slice(0, 10),
  skipRules: previous.skipRules ?? {},
  findings: sorted,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(
  `${outPath}: ${json.results.length} findings across ${Object.keys(sorted).length} rules`,
);
