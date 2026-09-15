#!/usr/bin/env node
// Usage: node scripts/check-release-tag.mjs v1.2.3
// Fails unless the tag is exactly "v" plus the version in packages/core/package.json (the CLI's
// version is checked against the core's by the version test and by scripts/check-pack.mjs).
import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const { version } = JSON.parse(readFileSync("packages/core/package.json", "utf8"));
if (tag !== `v${version}`) {
  console.error(`tag ${tag || "(none)"} does not match package version ${version}`);
  process.exit(1);
}
console.log(`tag ${tag} matches package version ${version}`);
