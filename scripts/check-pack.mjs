#!/usr/bin/env node
// Usage: node scripts/check-pack.mjs   (after npm run build)
//
// Dry-runs npm pack for both published packages and fails when a file that must ship is missing,
// a file that must not ship is present, a package is not one this check knows, or the two versions
// differ. Scripts are skipped so the check looks at what the last build produced, exactly as the
// release workflow publishes it.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED = {
  "@pbiplint/core": [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/index.d.ts.map",
    "src/index.ts",
  ],
  pbiplint: [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/pbiplint.mjs",
    "sample/Messy Sales Demo.SemanticModel/definition/model.tmdl",
    "sample/Messy Sales Demo.SemanticModel/definition/tables/Sales.tmdl",
    "sample/Messy Sales Demo.Report/definition/report.json",
    "sample/Messy Sales Demo.pbip",
    "sample/pbiplint.config.json",
  ],
};
/**
 * Anchored at a path segment rather than at the package root: the core ships all of src, so a
 * .env.local or a test folder deeper in the tree has to be caught as well.
 */
export const FORBIDDEN = [
  /(^|\/)test\//,
  /\.test\./,
  /tsbuildinfo$/,
  /(^|\/)\.env/,
  /\.DS_Store$/,
  /(^|\/)node_modules\//,
];

/** Everything wrong with one `npm pack --dry-run --json` result, as a list of messages. */
export function packProblems(packs) {
  const problems = [];
  for (const pack of packs) {
    // A renamed package would otherwise be checked against an empty list and pass in silence.
    // Object.hasOwn rather than a truthiness test on the lookup, because a package named after
    // something on Object.prototype, constructor or toString, would find an inherited function
    // there and read as known.
    if (!Object.hasOwn(REQUIRED, pack.name)) {
      problems.push(
        `${pack.name}: not a package this check knows; add it to REQUIRED or stop packing it`,
      );
      continue;
    }
    const required = REQUIRED[pack.name];
    const files = new Set(pack.files.map((f) => f.path));
    for (const f of required) if (!files.has(f)) problems.push(`${pack.name}: missing ${f}`);
    for (const f of files)
      if (FORBIDDEN.some((re) => re.test(f))) problems.push(`${pack.name}: must not ship ${f}`);
  }
  if (packs.length !== 2) problems.push(`expected 2 packages, got ${packs.length}`);
  const versions = new Set(packs.map((p) => p.version));
  if (versions.size !== 1) problems.push(`versions differ: ${[...versions].join(", ")}`);
  return problems;
}

function main() {
  const json = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "-w", "@pbiplint/core", "-w", "pbiplint"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const packs = JSON.parse(json);
  for (const pack of packs)
    console.log(
      `${pack.name}@${pack.version}: ${pack.entryCount} files, ${(pack.unpackedSize / 1024).toFixed(0)} KB unpacked`,
    );
  const problems = packProblems(packs);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log("pack contents look right");
}

// Only when run as a script, so packProblems can be imported by a test. argv[1] is realpathed
// first because Node realpaths the ESM main and not argv[1], so invoking this through a symlink
// would leave the two spellings unequal, skip main() and exit 0, and a pack check that inspected
// nothing would look like one that passed.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
