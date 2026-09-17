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
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PACKAGE_DIRS = ["packages/core", "packages/cli"];

/**
 * What one `npm view <name>@<version> version` run actually established.
 *
 * "published" only when the registry answered with the version asked for, "missing" only when it
 * answered 404, "unknown" for anything else. The difference matters: a registry that cannot be
 * reached looks exactly like a package that was never published, and treating that as missing
 * falls through to a publish the registry then rejects, reporting a network problem as a
 * publishing one.
 */
export function viewState(result, version) {
  if (result.error) return "unknown";
  const stdout = `${result.stdout ?? ""}`;
  if (result.status === 0) return stdout.trim() === version ? "published" : "unknown";
  return /E404|404 Not Found/.test(`${stdout}${result.stderr ?? ""}`) ? "missing" : "unknown";
}

function main() {
  for (const dir of PACKAGE_DIRS) {
    const { name, version } = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
    const seen = spawnSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" });
    const state = viewState(seen, version);
    if (state === "published") {
      console.log(`${name}@${version} is already published, skipping`);
      continue;
    }
    if (state === "unknown") {
      console.error(`${seen.stderr ?? ""}${seen.stdout ?? ""}${seen.error?.message ?? ""}`.trim());
      throw new Error(
        `npm view ${name}@${version} answered with neither that version nor a 404, so whether it is published is unknown; not publishing`,
      );
    }
    console.log(`publishing ${name}@${version}`);
    execFileSync("npm", ["publish", "--ignore-scripts", "-w", name], { stdio: "inherit" });
  }
}

// Only when run as a script, so viewState can be imported by a test. argv[1] is realpathed first
// because Node realpaths the ESM main and not argv[1], so invoking this through a symlink would
// leave the two spellings unequal, skip main() and exit 0, and the workflow would go on to create
// a GitHub release for a version that was never published.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
