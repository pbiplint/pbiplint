import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { ROBOTS, selfHostPlugin } from "../src/build/self-host.js";

describe("selfHostPlugin", () => {
  it("keeps crawlers out and leaves GitHub Pages' domain file behind, in the finished build only", () => {
    const dist = tempDir("dist");
    writeFileSync(join(dist, "CNAME"), "pbiplint.com");
    writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");
    writeFileSync(join(dist, "index.html"), "<html></html>");
    const plugin = selfHostPlugin();
    expect(plugin.apply).toBe("build");
    (plugin.configResolved as unknown as (c: { root: string; build: { outDir: string } }) => void)({
      root: dirname(dist),
      build: { outDir: basename(dist) },
    });
    (plugin.closeBundle as unknown as () => void)();
    expect(existsSync(join(dist, "CNAME"))).toBe(false);
    expect(readFileSync(join(dist, "robots.txt"), "utf8")).toBe(ROBOTS);
    expect(ROBOTS).toBe("User-agent: *\nDisallow: /\n");
    expect(existsSync(join(dist, "index.html"))).toBe(true);
  });
});
