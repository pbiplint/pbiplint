import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../tests/support/temp-dir.js";
import { archiveSite } from "../site-archive.mjs";

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** A self-hosting build in miniature: what the archive must hold, at its root. */
function selfHostDist() {
  const dist = tempDir("dist");
  mkdirSync(join(dist, "rules", "x"), { recursive: true });
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<html>home</html>");
  writeFileSync(join(dist, "rules", "x", "index.html"), "<html>rule</html>");
  writeFileSync(join(dist, "assets", "a.js"), "1");
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
  return dist;
}

describe("archiveSite", () => {
  it("zips the build with its files at the root, copies the egress check, and lists both in SHA256SUMS", () => {
    const dist = selfHostDist();
    const out = tempDir("out");
    const check = join(tempDir("egress"), "egress-check.mjs");
    writeFileSync(check, "// the check\n");
    const files = archiveSite({ dist, version: "0.3.1", egressCheck: check, outDir: out });
    expect(files).toEqual([
      "pbiplint-site-0.3.1.zip",
      "pbiplint-egress-check-0.3.1.mjs",
      "SHA256SUMS",
    ]);
    // Files at the zip's root, so a firm uploads its contents straight into the $web container.
    const listing = execFileSync("unzip", ["-Z1", join(out, "pbiplint-site-0.3.1.zip")], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l && !l.endsWith("/"))
      .sort();
    expect(listing).toEqual(["assets/a.js", "index.html", "robots.txt", "rules/x/index.html"]);
    expect(readFileSync(join(out, "pbiplint-egress-check-0.3.1.mjs"), "utf8")).toBe(
      "// the check\n",
    );
    // The format `sha256sum -c` and `shasum -a 256 -c` read.
    expect(readFileSync(join(out, "SHA256SUMS"), "utf8")).toBe(
      `${sha(join(out, "pbiplint-site-0.3.1.zip"))}  pbiplint-site-0.3.1.zip\n` +
        `${sha(join(out, "pbiplint-egress-check-0.3.1.mjs"))}  pbiplint-egress-check-0.3.1.mjs\n`,
    );
  });

  it("refuses the public build, so a release can never attach pbiplint.com's files by mistake", () => {
    const check = join(tempDir("egress"), "egress-check.mjs");
    writeFileSync(check, "");
    for (const extra of ["CNAME", "sitemap.xml"]) {
      const dist = selfHostDist();
      writeFileSync(join(dist, extra), "x");
      expect(() =>
        archiveSite({ dist, version: "0.3.1", egressCheck: check, outDir: tempDir("out") }),
      ).toThrow("not the self-hosting build");
    }
    const noRobots = selfHostDist();
    writeFileSync(join(noRobots, "robots.txt"), "User-agent: *\nAllow: /\n");
    expect(() =>
      archiveSite({ dist: noRobots, version: "0.3.1", egressCheck: check, outDir: tempDir("out") }),
    ).toThrow("not the self-hosting build");
  });
});
