import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

/** The Vite mode that makes the self-hosting build: `npm run build -w @pbiplint/web -- --mode self-host`. */
export const SELF_HOST_MODE = "self-host";

/** A copy inside a firm is not for search engines, and it names no sitemap because it has none. */
export const ROBOTS = "User-agent: *\nDisallow: /\n";

/**
 * Finishes the self-hosting build's folder: `robots.txt` keeps crawlers out, and `CNAME`, which
 * only GitHub Pages reads, for pbiplint.com, is left out. Both come from public/ unchanged, so this
 * runs on the written folder, ahead of the site check, which is listed after it.
 */
export function selfHostPlugin(): Plugin {
  let outDir = "";
  return {
    name: "pbiplint-self-host",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      writeFileSync(join(outDir, "robots.txt"), ROBOTS);
      rmSync(join(outDir, "CNAME"), { force: true });
    },
  };
}
