#!/usr/bin/env node
// Usage: node scripts/publish.mjs   (in the release workflow, after build and check:pack)
//
// Publishes each package whose version is not on the registry yet. Skipping what is already there
// makes the workflow safe to rerun and lets a tag follow a first publish done by hand.
// In GitHub Actions the publish authenticates through npm trusted publishing (OIDC), so no token
// is read here; provenance is attached by npm.
// The publish runs with --ignore-scripts, so the tarball is exactly the tree check:pack
// inspected: no prepack rebuild happens between the check and the upload.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

for (const dir of ["packages/core", "packages/cli"]) {
  const { name, version } = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  const seen = spawnSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" });
  if (seen.status === 0 && seen.stdout.trim() === version) {
    console.log(`${name}@${version} is already published, skipping`);
    continue;
  }
  console.log(`publishing ${name}@${version}`);
  execFileSync("npm", ["publish", "--ignore-scripts", "-w", name], { stdio: "inherit" });
}
