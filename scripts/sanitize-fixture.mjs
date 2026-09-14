#!/usr/bin/env node
// Usage: node scripts/sanitize-fixture.mjs <modelDir>
// Rewrites every File.Contents("<path>") in .tmdl files to C:\Demo\Data\<basename>
// and deletes files that do not belong in a fixture.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/sanitize-fixture.mjs <modelDir>");
  process.exit(2);
}
const JUNK = new Set([".DS_Store", "cache.abf", "localSettings.json", "diagramLayout.json"]);
let rewritten = 0;
let removed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    if (JUNK.has(entry.name)) {
      rmSync(p);
      removed++;
      continue;
    }
    if (!entry.name.endsWith(".tmdl")) continue;
    const text = readFileSync(p, "utf8");
    const out = text.replace(/File\.Contents\("([^"]+)"\)/g, (_, path) => {
      const base = path.split(/[\\/]/).pop();
      return `File.Contents("C:\\Demo\\Data\\${base}")`;
    });
    if (out !== text) {
      writeFileSync(p, out);
      rewritten++;
    }
  }
}

walk(root);
console.log(`${root}: rewrote ${rewritten} file(s), removed ${removed} junk file(s)`);
