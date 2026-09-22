#!/usr/bin/env node
// Usage: node scripts/sanitize-fixture.mjs <modelDir | projectDir>
// Rewrites every File.Contents("<path>"), and every other string holding an absolute path, in
// .tmdl files to C:\Demo\Data\<basename>, deletes files and folders that do not belong in a
// fixture (Desktop caches, layouts, registered resources, custom visual packages, .pbix), and
// edits report.json so it no longer names the resources that were removed. TMDL carries no data;
// paths reveal folder names, and resources are binaries nothing here reads.
import { readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const JUNK_FILES = new Set([".DS_Store", "cache.abf", "localSettings.json", "diagramLayout.json"]);
const JUNK_DIRS = new Set([".pbi", "StaticResources", "CustomVisuals"]);
const JUNK_SUFFIXES = [".pbix"];

// A string literal holding an absolute path: a drive (C:\ or C:/), a UNC share (\\host\), or a
// macOS or Linux home or volume. Outside File.Contents these still name folders, as in
// Folder.Files("Y:\...") and the [Folder Path] comparison Desktop writes beside it.
const ABSOLUTE_PATH_LITERAL = /"((?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|Volumes|home)\/)[^"]*)"/g;

/** C:\Demo\Data\<basename>, keeping a folder's trailing separator so a [Folder Path] test still matches. */
function placeholder(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const trailing = trimmed === path ? "" : "\\";
  return `C:\\Demo\\Data\\${trimmed.split(/[\\/]/).pop()}${trailing}`;
}

export function sanitizeProject(root) {
  const counts = { rewritten: 0, removed: 0, edited: 0 };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (JUNK_DIRS.has(entry.name)) {
          rmSync(p, { recursive: true, force: true });
          counts.removed++;
        } else walk(p);
        continue;
      }
      if (JUNK_FILES.has(entry.name) || JUNK_SUFFIXES.some((s) => entry.name.endsWith(s))) {
        rmSync(p);
        counts.removed++;
        continue;
      }
      if (entry.name.endsWith(".tmdl")) {
        const text = readFileSync(p, "utf8");
        const out = text
          .replace(
            /File\.Contents\("([^"]+)"\)/g,
            (_, path) => `File.Contents("${placeholder(path)}")`,
          )
          .replace(ABSOLUTE_PATH_LITERAL, (_, path) => `"${placeholder(path)}"`);
        if (out !== text) {
          writeFileSync(p, out);
          counts.rewritten++;
        }
      } else if (entry.name === "report.json" && basename(dir) === "definition") {
        const json = JSON.parse(readFileSync(p, "utf8"));
        let changed = false;
        if (Array.isArray(json.resourcePackages)) {
          const kept = json.resourcePackages.filter((r) => r.type !== "RegisteredResources");
          if (kept.length !== json.resourcePackages.length) {
            json.resourcePackages = kept;
            changed = true;
          }
        }
        if (json.themeCollection?.customTheme?.type === "RegisteredResources") {
          delete json.themeCollection.customTheme;
          changed = true;
        }
        if (changed) {
          writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
          counts.edited++;
        }
      }
    }
  };
  if (!statSync(root).isDirectory()) throw new Error(`${root} is not a folder`);
  walk(root);
  return counts;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: node scripts/sanitize-fixture.mjs <modelDir | projectDir>");
    process.exit(2);
  }
  const c = sanitizeProject(root);
  console.log(
    `${root}: rewrote ${c.rewritten} file(s), removed ${c.removed} item(s), edited ${c.edited} report file(s)`,
  );
}

// Only when run as a script, so sanitizeProject can be imported by a test (argv[1] is realpathed
// for the reason check-pack.mjs gives).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
