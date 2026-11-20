#!/usr/bin/env node
// Fetch the survey's rule files for the survey parity test (custom-te-survey.test.ts).
//
//   node scripts/fetch-survey-rules.mjs <files.json> <outDir>
//
// Fetches each file tests/expectations/survey/files.json lists at its commit, checks its sha256,
// and writes it as <outDir>/<n>.json, n its place in the list. <outDir>/index.json maps each file
// id to its local name, or to { unavailable: "<url> returned 404" } when GitHub no longer has it.
// A sha256 that does not match stops the script. The files are never committed: several carry no
// license. Run by the Survey parity workflow (.github/workflows/survey-parity.yml).
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchRuleFile, ruleFileUrl } from "./te-expectations.mjs";

/**
 * Fetches every listed file into `outDir` and returns the index it writes there: each file id to
 * its local name, or to the reason it is unavailable. `get` is the fetch to use.
 */
export async function fetchSurveyRules(files, outDir, get = fetch, log = () => {}) {
  mkdirSync(outDir, { recursive: true });
  const index = {};
  for (const [i, file] of files.entries()) {
    const body = await fetchRuleFile(file, get);
    if (body === null) {
      index[file.id] = { unavailable: `${ruleFileUrl(file)} returned 404` };
      log(`${i + 1}/${files.length} ${file.id}: unavailable`);
      continue;
    }
    const name = `${i}.json`;
    writeFileSync(join(outDir, name), body);
    index[file.id] = name;
    log(`${i + 1}/${files.length} ${file.id}`);
  }
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}

async function main() {
  const [listPath, outDir] = process.argv.slice(2);
  if (!listPath || !outDir) {
    console.error("usage: fetch-survey-rules <files.json> <outDir>");
    process.exit(2);
  }
  const { files } = JSON.parse(readFileSync(listPath, "utf8"));
  const index = await fetchSurveyRules(files, outDir, fetch, (line) => console.error(line));
  const gone = Object.values(index).filter((v) => typeof v !== "string").length;
  console.log(`${outDir}: ${files.length - gone} rule files, ${gone} unavailable`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
