import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  contentPage,
  pageLayer,
  parseFrontmatter,
  publishesLayer,
  ruleLinks,
  rulePage,
  rulesIndex,
  sitemap,
  type RuleMeta,
} from "./pages.js";

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
  // The delete below is derived from outDir while the sources are read from rulesDir, so a caller
  // that pointed outDir at the repo root would erase the very Markdown this is generating from.
  if (resolve(outDir, "rules") === resolve(rulesDir))
    throw new Error(`outDir would delete the rule sources in ${resolve(rulesDir)}`);
  const metas: RuleMeta[] = [];
  const pages: { slug: string; html: string }[] = [];
  const sources = readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({
      slug: file.replace(/\.md$/, ""),
      markdown: readFileSync(join(rulesDir, file), "utf8"),
    }))
    // The one gate on what the site publishes, and the only one: the link map, the pages, the
    // index, and the sitemap below all read this list, so a page on a layer SITE_LAYERS leaves
    // out is missing from every one of them and nothing downstream has to ask about a layer again.
    .filter(({ slug, markdown }) => {
      const source = `rules/${slug}.md`;
      return publishesLayer(pageLayer(parseFrontmatter(markdown, source).data, source));
    });
  // Every page's id is known before any page renders, so a code span naming a rule links only to
  // a page this build is about to write.
  const links = ruleLinks(sources);
  for (const { slug, markdown } of sources) {
    const { html, meta } = rulePage(markdown, slug, links);
    pages.push({ slug, html });
    metas.push(meta);
  }
  // Computed before anything is deleted, so a rule the index rejects leaves the previous build in
  // place rather than a tree of pages with no index to reach them.
  const index = rulesIndex(metas);
  // Every page under rules/ is generated and gitignored, so it is cleared first: a renamed or
  // deleted rule would otherwise leave a page behind that nothing links to and the sitemap no
  // longer names, until the next clean checkout.
  rmSync(join(outDir, "rules"), { recursive: true, force: true });
  for (const p of pages) write(join(outDir, "rules", p.slug, "index.html"), p.html);
  write(join(outDir, "rules", "index.html"), index);
  write(
    join(outDir, "about", "index.html"),
    contentPage(readFileSync(join(contentDir, "about.md"), "utf8"), "/about/", "content/about.md"),
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

// Playwright's folders hold index.html files too (its report bundles fetch and XMLHttpRequest,
// which the site check would then reject), so they are skipped by name along with the rest. Only
// where they sit: these are the package's own folders, and a rule is free to be called "src".
const NOT_PAGES = new Set([
  "node_modules",
  "dist",
  "public",
  "src",
  "test",
  "content",
  "e2e",
  "test-results",
  "playwright-report",
]);

/** Every index.html under the package plus 404.html, keyed by site path, for Rollup. */
export function pageEntries(root: string): Record<string, string> {
  const files: string[] = [];
  // Pruned on the way down rather than filtered afterwards, so a skipped folder is never opened:
  // node_modules alone can hold more files than the rest of the package put together.
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isDirectory()) {
        if (prefix === "" && NOT_PAGES.has(entry.name)) continue;
        walk(join(dir, entry.name), `${rel}/`);
      } else if (entry.name === "index.html" || rel === "404.html") files.push(rel);
    }
  };
  walk(root, "");
  return Object.fromEntries(
    files.map((p) => [
      p.replace(/\/?index\.html$/, "").replace(/\.html$/, "") || "home",
      join(root, p),
    ]),
  );
}

/** Generates the pages before Vite reads its config, in dev and in build, and registers them as entries. */
export function generatePlugin(): Plugin {
  return {
    name: "pbiplint-generate",
    // vite preview resolves the config the same way the dev server does, and this plugin writes
    // into the source tree: previewing a build would regenerate every page underneath the finished
    // one it was asked to serve.
    apply: (_config, env) => !env.isPreview,
    config() {
      const n = generateSite().length;
      console.log(`generated ${n} rule pages, the rules index, the about page, and the sitemap`);
      return { build: { rollupOptions: { input: pageEntries(WEB_ROOT) } } };
    },
  };
}
