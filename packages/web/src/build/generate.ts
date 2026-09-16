import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { contentPage, rulePage, rulesIndex, sitemap, type RuleMeta } from "./pages.js";

export const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const RULES_DIR = join(WEB_ROOT, "../../rules");
export const CONTENT_DIR = join(WEB_ROOT, "content");

export interface GenerateOptions {
  rulesDir?: string;
  contentDir?: string;
  outDir?: string;
}

/** Writes rules/<slug>/index.html, rules/index.html, about/index.html, and public/sitemap.xml under outDir. */
export function generateSite({
  rulesDir = RULES_DIR,
  contentDir = CONTENT_DIR,
  outDir = WEB_ROOT,
}: GenerateOptions = {}): RuleMeta[] {
  const metas: RuleMeta[] = [];
  for (const file of readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const slug = file.replace(/\.md$/, "");
    const { html, meta } = rulePage(readFileSync(join(rulesDir, file), "utf8"), slug);
    write(join(outDir, "rules", slug, "index.html"), html);
    metas.push(meta);
  }
  write(join(outDir, "rules", "index.html"), rulesIndex(metas));
  write(
    join(outDir, "about", "index.html"),
    contentPage(readFileSync(join(contentDir, "about.md"), "utf8"), "/about/"),
  );
  write(
    join(outDir, "public", "sitemap.xml"),
    sitemap(["/", "/about/", "/rules/", ...metas.map((m) => `/rules/${m.slug}/`)]),
  );
  return metas;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Every index.html under the package plus 404.html, keyed by site path, for Rollup. */
export function pageEntries(root: string): Record<string, string> {
  // Playwright's folders hold index.html files too (its report bundles fetch and XMLHttpRequest,
  // which the site check would then reject), so they are skipped by name along with the rest.
  const skip =
    /^(node_modules|dist|public|src|test|content|e2e|test-results|playwright-report)([\\/]|$)/;
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((p) => !skip.test(p) && (p.endsWith("index.html") || p === "404.html"));
  return Object.fromEntries(
    files.map((p) => [
      p
        .split("\\")
        .join("/")
        .replace(/\/?index\.html$/, "")
        .replace(/\.html$/, "") || "home",
      join(root, p),
    ]),
  );
}

/** Generates the pages before Vite reads its config, in dev and in build, and registers them as entries. */
export function generatePlugin(): Plugin {
  return {
    name: "pbiplint-generate",
    config() {
      const n = generateSite().length;
      console.log(`generated ${n} rule pages, the rules index, the about page, and the sitemap`);
      return { build: { rollupOptions: { input: pageEntries(WEB_ROOT) } } };
    },
  };
}
