#!/usr/bin/env node
// Usage: node scripts/site-archive.mjs <out dir>
//   (in the release workflow, after `npm run build -w @pbiplint/web -- --mode self-host`)
//
// Packs what a release attaches for firms that host the site themselves (issue #93): the
// self-hosting build of packages/web/dist as pbiplint-site-<version>.zip, with its files at the
// zip's root so they upload straight into a static website's $web container; the egress check as
// pbiplint-egress-check-<version>.mjs; and SHA256SUMS over both, in the format `sha256sum -c`
// reads. It refuses a folder that is the public build. The version is the packages' own.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Writes the three release files into `outDir` and returns their names. */
export function archiveSite({ dist, version, egressCheck, outDir }) {
  const robots = existsSync(join(dist, "robots.txt"))
    ? readFileSync(join(dist, "robots.txt"), "utf8")
    : "";
  if (
    existsSync(join(dist, "CNAME")) ||
    existsSync(join(dist, "sitemap.xml")) ||
    !/^Disallow: \/$/m.test(robots)
  )
    throw new Error(
      `${dist} is not the self-hosting build; build it with npm run build -w @pbiplint/web -- --mode self-host`,
    );
  mkdirSync(outDir, { recursive: true });
  const zip = `pbiplint-site-${version}.zip`;
  const check = `pbiplint-egress-check-${version}.mjs`;
  // -X leaves out extra file attributes such as owners, which say nothing about the site.
  execFileSync("zip", ["-q", "-r", "-X", resolve(outDir, zip), "."], { cwd: dist });
  copyFileSync(egressCheck, join(outDir, check));
  const sums = [zip, check]
    .map((name) => {
      const hash = createHash("sha256")
        .update(readFileSync(join(outDir, name)))
        .digest("hex");
      return `${hash}  ${name}\n`;
    })
    .join("");
  writeFileSync(join(outDir, "SHA256SUMS"), sums);
  return [zip, check, "SHA256SUMS"];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: node scripts/site-archive.mjs <out dir>");
    process.exit(2);
  }
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const { version } = JSON.parse(readFileSync(join(repo, "packages/core/package.json"), "utf8"));
  const files = archiveSite({
    dist: join(repo, "packages/web/dist"),
    version,
    egressCheck: join(repo, "packages/web/egress/egress-check.mjs"),
    outDir,
  });
  for (const f of files) console.log(join(outDir, f));
}
