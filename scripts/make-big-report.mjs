#!/usr/bin/env node
// Usage: node scripts/make-big-report.mjs <out>
// Copies tests/fixtures/base-rules-fails (a whole PBIP) to <out>, replacing an earlier copy, and
// stamps card visuals on the report's first page until the report holds 300 visuals, so the
// browser suite can hold the lint of a large report to its two-second budget. Nothing it writes is
// committed (.gitignore lists tests/generated/, where the suite puts it), and the fixture is only
// ever read.
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const FIXTURE = fileURLToPath(new URL("../tests/fixtures/base-rules-fails", import.meta.url));
const PROJECT_FILE = "Base-rules-fails.pbip";
const TOTAL = 300;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** The pages folder of the one .Report folder directly under `dir`. */
function pagesDir(dir) {
  const reports = readdirSync(dir).filter((name) => name.endsWith(".Report"));
  if (reports.length !== 1)
    throw new Error(`${dir} holds ${reports.length} .Report folders, where one was expected`);
  return join(dir, reports[0], "definition", "pages");
}

/** A page's visual folders (each holding a visual.json), sorted by name. */
function visualsOf(page) {
  const dir = join(page, "visuals");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "visual.json")))
    .sort();
}

/**
 * Stamps copies of the first page's first card visual onto that page (the first in pages.json's
 * page order) until the report under `dir` holds `total` visuals, and returns the count. Each copy
 * gets a fresh 20-hex name, its own cell of a grid laid inside the page, and the next place in the
 * tab order after the page's highest.
 */
export function stampVisuals(dir, total) {
  const pages = pagesDir(dir);
  const pageDirs = readdirSync(pages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pages, entry.name));
  const names = pageDirs.flatMap(visualsOf);
  if (names.length > total)
    throw new Error(`the report already holds ${names.length} visuals, more than ${total}`);
  const taken = new Set(names);

  const first = join(pages, readJson(join(pages, "pages.json")).pageOrder[0]);
  const page = readJson(join(first, "page.json"));
  const own = visualsOf(first).map((name) => readJson(join(first, "visuals", name, "visual.json")));
  const template = own.find((v) => v.visual?.visualType === "card");
  if (!template) throw new Error(`the first page, ${basename(first)}, has no card visual to copy`);

  // Whole-pixel cells, so the last column and the last row end inside the page rather than a
  // rounding error past its edge.
  const count = total - names.length;
  const columns = Math.ceil(Math.sqrt((count * page.width) / page.height));
  const rows = Math.ceil(count / columns);
  const width = Math.floor(page.width / columns);
  const height = Math.floor(page.height / rows);
  const tabOrder = Math.max(...own.map((v) => v.position?.tabOrder ?? 0)) + 1;
  const z = Math.max(...own.map((v) => v.position?.z ?? 0)) + 1;

  for (let i = 0; i < count; i++) {
    let name;
    do name = randomBytes(10).toString("hex");
    while (taken.has(name));
    taken.add(name);
    const visual = JSON.parse(JSON.stringify(template));
    visual.name = name;
    visual.position = {
      x: (i % columns) * width,
      y: Math.floor(i / columns) * height,
      z: z + i,
      width,
      height,
      tabOrder: tabOrder + i,
    };
    mkdirSync(join(first, "visuals", name));
    writeFileSync(
      join(first, "visuals", name, "visual.json"),
      `${JSON.stringify(visual, null, 2)}\n`,
    );
  }
  return names.length + count;
}

/** Copies the fixture to `out`, replacing an earlier copy, and stamps it to `total` visuals. */
export function makeBigReport(out, total = TOTAL) {
  const target = resolve(out);
  // Only an earlier copy is ever replaced: a slip of the argument must not delete a real folder,
  // and the fixture is never written to.
  if (target === resolve(FIXTURE)) throw new Error("refusing to write over the fixture itself");
  if (existsSync(target) && readdirSync(target).length > 0) {
    if (!existsSync(join(target, PROJECT_FILE)))
      throw new Error(`${out} exists and is not an earlier copy of the fixture; not replacing it`);
    rmSync(target, { recursive: true, force: true });
  }
  cpSync(FIXTURE, target, { recursive: true });
  return stampVisuals(target, total);
}

function main() {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node scripts/make-big-report.mjs <out>");
    process.exit(2);
  }
  console.log(`${out}: ${makeBigReport(out)} visuals`);
}

// Only when run as a script, so stampVisuals can be imported by a test (argv[1] is realpathed
// for the reason check-pack.mjs gives).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
