#!/usr/bin/env node
// Usage: node scripts/check-pack.mjs   (after npm run build)
//
// Dry-runs npm pack for all three published packages and fails when a file that must ship is
// missing, a file that must not ship is present, or the versions differ. Scripts are skipped so
// the check looks at what the last build produced, exactly as the release workflow publishes it.
// Every package's LICENSE is copied from the repo root by its build and is gitignored, and npm is
// silent when a `files` entry names a file that is not there, so an unbuilt checkout would
// otherwise pack a license-less tarball. Requiring it here is what makes that loud.
import { execFileSync } from "node:child_process";

const REQUIRED = {
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
    "sample/definition/model.tmdl",
    "sample/definition/tables/Sales.tmdl",
  ],
  // No NOTICE: it covers the vendored Microsoft ruleset, which the alias does not contain.
  "pbip-lint": ["package.json", "README.md", "LICENSE", "bin/pbip-lint.mjs"],
};
const FORBIDDEN = [
  /^test\//,
  /\.test\./,
  /tsbuildinfo$/,
  /^\.env/,
  /\.DS_Store$/,
  /^node_modules\//,
];

const json = execFileSync(
  "npm",
  [
    "pack",
    "--dry-run",
    "--json",
    "--ignore-scripts",
    "-w",
    "@pbiplint/core",
    "-w",
    "pbiplint",
    "-w",
    "pbip-lint",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const packs = JSON.parse(json);
let ok = true;
const fail = (message) => {
  ok = false;
  console.error(message);
};
for (const pack of packs) {
  const files = new Set(pack.files.map((f) => f.path));
  for (const f of REQUIRED[pack.name] ?? []) if (!files.has(f)) fail(`${pack.name}: missing ${f}`);
  for (const f of files)
    if (FORBIDDEN.some((re) => re.test(f))) fail(`${pack.name}: must not ship ${f}`);
  console.log(
    `${pack.name}@${pack.version}: ${pack.entryCount} files, ${(pack.unpackedSize / 1024).toFixed(0)} KB unpacked`,
  );
}
if (packs.length !== 3) fail(`expected 3 packages, got ${packs.length}`);
const versions = new Set(packs.map((p) => p.version));
if (versions.size !== 1) fail(`versions differ: ${[...versions].join(", ")}`);
if (!ok) process.exit(1);
console.log("pack contents look right");
