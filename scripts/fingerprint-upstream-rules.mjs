#!/usr/bin/env node
// Writes packages/core/src/custom-rules/te/upstream-rules.data.ts: the fingerprint of every
// published version of the rules pbiplint carries as its own (custom rules spec, section 4).
//
//   npm run build
//   GH_TOKEN=<token> node scripts/fingerprint-upstream-rules.mjs <scratchDir>
//
// Run by hand when a source publishes a new version (docs/RELEASING.md), never in CI. It reads,
// through GitHub's API, every version of Microsoft's BestPracticeRules/**/BPARules*.json (every
// language) in microsoft/Analysis-Services and of every rule file in TabularEditor/BestPracticeRules,
// in each repository's history up to the commit pinned below, and saves each version it downloads
// in <scratchDir> as data. It keeps only ids pbiplint's built-in rules carry, read from the built
// core, and stores for each distinct version only its id, scope key, expression hash, and severity.
// No rule text is stored: TabularEditor/BestPracticeRules carries no license. GH_TOKEN is optional;
// without it GitHub allows 60 requests an hour, fewer than a run makes.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The sources, each read up to its pinned commit (the default branch's head on November 20, 2026). */
export const SOURCES = [
  {
    repository: "microsoft/Analysis-Services",
    commit: "d3ccb5032c9029b097276b88412f7b61df6e73b8",
    license: "MIT",
    folder: "BestPracticeRules",
    isRuleFile: (path) => /(^|\/)BPARules[^/]*\.json$/i.test(path),
  },
  {
    repository: "TabularEditor/BestPracticeRules",
    commit: "98e71e15fbd2a53d2e63d2b6bc3e99545461d501",
    license: "none",
    folder: "",
    isRuleFile: (path) => /\.json$/i.test(path),
  },
];

const OUT = "packages/core/src/custom-rules/te/upstream-rules.data.ts";

/** .NET's char.IsWhiteSpace, as core's isWhiteSpaceCode (custom-rules/te/library.ts) has it. */
const isWhiteSpaceCode = (c) =>
  (c >= 9 && c <= 13) ||
  c === 0x20 ||
  c === 0x85 ||
  c === 0xa0 ||
  /\p{Z}/u.test(String.fromCharCode(c));

/**
 * An expression's fingerprint, as core's `fingerprint` (custom-rules/te/fingerprint.ts) computes
 * it: whitespace dropped outside double-quoted string literals (a literal runs to the next `"` that
 * is not doubled), the UTF-8 bytes hashed with 64-bit FNV-1a (a lone surrogate as U+FFFD, as
 * `Buffer.from` writes it), 16 lowercase hex digits.
 */
export function fingerprint(expression) {
  let kept = "";
  let inLiteral = false;
  for (let i = 0; i < expression.length; i++) {
    const c = expression.charCodeAt(i);
    if (c === 0x22) inLiteral = !inLiteral;
    if (inLiteral || !isWhiteSpaceCode(c)) kept += expression[i];
  }
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(kept, "utf8"))
    h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, "0");
}

const scopeKey = (scopes) => [...scopes].sort().join(",");

/**
 * The rules a file version holds, read with core's reader (`read`, readTeRuleFile): a rule list or
 * a `rules` wrapper as Tabular Editor reads them, or a file of one rule, as the Tabular Editor
 * repository's src folder holds. A version the reader refuses holds none.
 */
export function readRules(text, read) {
  const whole = read(text);
  if (!("error" in whole)) return whole.rules;
  const one = read(`[${text.replace(/^\uFEFF/, "")}]`);
  return "error" in one ? [] : one.rules;
}

/**
 * One entry per distinct `{ id, scope, hash, severity }` across the file versions, for the rules
 * whose id (any case) is in `ids`, an upper-case id to pbiplint's spelling; sorted. A rule with no
 * Severity takes 1, Tabular Editor 2's default, as core's teSeverity reads it.
 */
export function fingerprintVersions(files, ids, read) {
  const seen = new Map();
  for (const { text } of files)
    for (const rule of readRules(text, read)) {
      const id = ids.get(rule.id.toUpperCase());
      if (id === undefined) continue;
      const entry = {
        id,
        scope: scopeKey(rule.scopes),
        hash: fingerprint(rule.expression),
        severity: rule.severity ?? 1,
      };
      seen.set([entry.id, entry.scope, entry.hash, entry.severity].join("\0"), entry);
    }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e);
}

/** A GET against GitHub's API, as JSON or as the raw file. */
async function github(path, raw = false) {
  const headers = {
    accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
    "user-agent": "pbiplint-fingerprint-script",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com/${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/** Every commit in the source's history up to its pinned commit that touches its folder. */
async function commitsOf(source) {
  const shas = [];
  const path = source.folder ? `&path=${encodeURIComponent(source.folder)}` : "";
  for (let page = 1; ; page++) {
    const list = await github(
      `repos/${source.repository}/commits?sha=${source.commit}${path}&per_page=100&page=${page}`,
    );
    shas.push(...list.map((c) => c.sha));
    if (list.length < 100) return shas;
  }
}

/** The rule files in the source's folder at one commit: path (from the repository root) and blob. */
async function ruleFilesAt(source, commit) {
  const ref = source.folder ? `${commit}:${source.folder}` : commit;
  const tree = await github(
    `repos/${source.repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  if (tree === null) return [];
  if (tree.truncated) throw new Error(`${source.repository} at ${commit}: the tree is truncated`);
  return tree.tree
    .filter((t) => t.type === "blob")
    .map((t) => ({ path: source.folder ? `${source.folder}/${t.path}` : t.path, blob: t.sha }))
    .filter((f) => source.isRuleFile(f.path));
}

/** Every distinct version of the source's rule files, each read once, saved in `dir`. */
async function versionsOf(source, dir, log) {
  const byBlob = new Map();
  const commits = await commitsOf(source);
  for (const [i, commit] of commits.entries()) {
    for (const f of await ruleFilesAt(source, commit))
      if (!byBlob.has(f.blob)) byBlob.set(f.blob, { ...f, commit });
    log(`${source.repository}: ${i + 1}/${commits.length} commits, ${byBlob.size} versions`);
  }
  mkdirSync(dir, { recursive: true });
  const versions = [];
  for (const v of byBlob.values()) {
    const saved = join(dir, `${v.blob}.json`);
    let bytes;
    if (existsSync(saved)) bytes = readFileSync(saved);
    else {
      const path = v.path.split("/").map(encodeURIComponent).join("/");
      bytes = await github(`repos/${source.repository}/contents/${path}?ref=${v.commit}`, true);
      writeFileSync(saved, bytes);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    versions.push({ path: v.path, commit: v.commit, sha256, text: bytes.toString("utf8") });
  }
  versions.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.sha256 < b.sha256 ? -1 : 1,
  );
  return versions;
}

/** A property as Prettier writes it: on its own line, after the key when the line is too long. */
const property = (key, value) => {
  const line = `    ${key}: ${value},`;
  return line.length <= 100 ? `${line}\n` : `    ${key}:\n      ${value},\n`;
};
/** One entry as Prettier writes it, so the generated file needs no format pass. */
const entry = (e) =>
  `  {\n${property("id", JSON.stringify(e.id))}${property("scope", JSON.stringify(e.scope))}${property("hash", `"${e.hash}"`)}${property("severity", e.severity)}  },\n`;

/** The data file's text: the header naming each source and every version read, then the entries. */
export function dataFile(read, entries) {
  const header = read.flatMap(({ source, versions }) => [
    `// ${source.repository}, read up to commit ${source.commit} (license: ${source.license}),`,
    `// ${versions.length} file versions, by sha256, path, and a commit that holds it:`,
    ...versions.map((v) => `//   ${v.sha256} ${v.path} @ ${v.commit.slice(0, 12)}`),
  ]);
  return `// Generated by scripts/fingerprint-upstream-rules.mjs. Do not edit by hand.
// The fingerprint of every published version of a rule pbiplint carries as its own: its id as
// pbiplint spells it, its scopes (custom-rules/te/fingerprint.ts scopeKey), its expression's
// fingerprint, and its Severity (1 when the version has none). No rule text is stored.
//
${header.join("\n")}

export interface UpstreamRule {
  id: string;
  scope: string;
  hash: string;
  severity: number;
}

export const UPSTREAM_RULES: readonly UpstreamRule[] = [
${entries.map(entry).join("")}];
`;
}

async function main() {
  const [scratch] = process.argv.slice(2);
  if (!scratch) {
    console.error("usage: node scripts/fingerprint-upstream-rules.mjs <scratchDir>");
    process.exit(2);
  }
  const core = new URL("../packages/core/dist/", import.meta.url);
  const { defaultRules } = await import(new URL("index.js", core).href);
  const { readTeRuleFile } = await import(new URL("custom-rules/te/read.js", core).href);
  const ids = new Map(defaultRules.map((r) => [r.id.toUpperCase(), r.id]));
  const read = [];
  for (const source of SOURCES) {
    const dir = join(scratch, source.repository.replace("/", "_"));
    const versions = await versionsOf(source, dir, (line) => console.error(line));
    read.push({ source, versions });
  }
  const entries = fingerprintVersions(
    read.flatMap((r) => r.versions),
    ids,
    readTeRuleFile,
  );
  writeFileSync(OUT, dataFile(read, entries));
  const count = read.reduce((n, r) => n + r.versions.length, 0);
  console.log(`wrote ${entries.length} entries from ${count} file versions`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
