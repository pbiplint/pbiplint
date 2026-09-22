#!/usr/bin/env node
// Convert fab-inspector CLI output into a pbiplint report-parity expectation file.
//
//   node scripts/fab-expectations.mjs <fixtureDir> <out.report.json> --from <TestRun.json>
//   node scripts/fab-expectations.mjs <fixtureDir> <out.report.json> --cli <PBIRInspectorCLI> --rules <Base-rules.json>
//
// With --cli the oracle runs over the fixture's .Report with every rule enabled (the source ships
// ENSURE_ALTTEXT off; pbiplint ships it on). Keeps deviations, ours, and native from an existing
// file. fab-inspector is a development-time oracle only; see docs/RELEASING.md for the macOS
// invocation. Never run in CI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Rules whose Actual lists page display names rather than ids. */
const DISPLAY_NAME_RULES = new Set([
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY",
]);

export const enabledRuleset = (text) => {
  const json = JSON.parse(text);
  json.rules = json.rules.map((r) => (r.id === "template" ? r : { ...r, disabled: false }));
  return JSON.stringify(json, null, 2);
};

/** `Results[]` keyed by rule id, then by page id or `report`. */
export function convertResults(results, pageIdByDisplayName) {
  const out = {};
  for (const r of results) {
    if (r.RuleId === "template") continue;
    const page =
      /^\/definition\/pages\/([^/]+)\/page\.json$/.exec(r.ItemPath ?? "")?.[1] ?? "report";
    let actual = r.Actual;
    if (DISPLAY_NAME_RULES.has(r.RuleId) && Array.isArray(actual))
      actual = actual.map((name) => {
        const id = pageIdByDisplayName.get(name);
        if (id === undefined)
          throw new Error(`${r.RuleId}: no page named "${name}" in the fixture`);
        return id;
      });
    (out[r.RuleId] ??= {})[page] = { pass: r.Pass === true, actual };
  }
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((id) => [id, out[id]]),
  );
}

function pageIds(reportDir) {
  const map = new Map();
  const pages = join(reportDir, "definition", "pages");
  for (const entry of readdirSync(pages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = JSON.parse(readFileSync(join(pages, entry.name, "page.json"), "utf8"));
    if (map.has(page.displayName) && map.get(page.displayName) !== page.name)
      throw new Error(
        `two pages are called "${page.displayName}"; the oracle's names cannot be translated`,
      );
    map.set(page.displayName, page.name);
  }
  return map;
}

function main() {
  const [fixtureDir, outPath, ...rest] = process.argv.slice(2);
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!fixtureDir || !outPath || (!opt("--from") && !(opt("--cli") && opt("--rules")))) {
    console.error(
      "usage: fab-expectations <fixtureDir> <out.report.json> (--from <TestRun.json> | --cli <PBIRInspectorCLI> --rules <Base-rules.json>)",
    );
    process.exit(2);
  }
  const reportFolder = readdirSync(fixtureDir).find((n) => n.endsWith(".Report"));
  if (!reportFolder) throw new Error(`${fixtureDir} holds no .Report folder`);
  const reportDir = join(fixtureDir, reportFolder);
  let raw;
  let oracle;
  if (opt("--from")) {
    raw = readFileSync(opt("--from"), "utf8");
    oracle = opt("--oracle");
  } else {
    const rulesText = readFileSync(opt("--rules"), "utf8");
    const sha = createHash("sha256").update(rulesText).digest("hex");
    const tmp = mkdtempSync(join(tmpdir(), "fab-"));
    const enabled = join(tmp, "Base-rules.enabled.json");
    writeFileSync(enabled, enabledRuleset(rulesText));
    const run = spawnSync(
      opt("--cli"),
      ["-fabricitem", reportDir, "-rules", enabled, "-formats", "JSON", "-output", tmp],
      { encoding: "utf8" },
    );
    if (run.error) throw run.error;
    const file = readdirSync(tmp).find((n) => /^TestRun_.*\.json$/.test(n));
    if (!file)
      throw new Error(`the oracle wrote no TestRun_*.json to ${tmp}\n${run.stdout}\n${run.stderr}`);
    raw = readFileSync(join(tmp, file), "utf8");
    oracle = `fab-inspector CLI 3.4.0 with Base-rules.json sha256 ${sha}, every rule enabled`;
  }
  const json = JSON.parse(raw.replace(/^\ufeff/, ""));
  const results = convertResults(json.Results, pageIds(reportDir));
  const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
  const out = {
    fixture: relative(process.cwd(), fixtureDir).split("\\").join("/"),
    report: reportFolder,
    oracle: oracle ?? previous.oracle,
    captured: new Date().toISOString().slice(0, 10),
    deviations: previous.deviations ?? {},
    ours: previous.ours ?? {},
    native: previous.native ?? {},
    results,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  const failing = Object.values(results)
    .flatMap((pages) => Object.values(pages))
    .filter((r) => !r.pass).length;
  console.log(`${outPath}: ${Object.keys(results).length} rules, ${failing} failing results`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
