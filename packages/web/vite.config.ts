import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cspPlugin } from "./src/build/csp.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

/** Every index.html under the package (home, about, rules, each rule page) plus 404.html is a page. */
function pages(): Record<string, string> {
  const skip = /^(node_modules|dist|public)(\/|$)/;
  const entries = readdirSync(root, { recursive: true })
    .map(String)
    .filter((p) => !skip.test(p) && (p.endsWith("index.html") || p === "404.html"));
  return Object.fromEntries(
    entries.map((p) => [
      p.replace(/\/?index\.html$/, "").replace(/\.html$/, "") || "home",
      join(root, p),
    ]),
  );
}

export default defineConfig({
  root,
  base: "/",
  plugins: [cspPlugin()],
  resolve: {
    alias: { "@pbiplint/core": join(repo, "packages/core/src/index.ts") },
  },
  server: { fs: { allow: [repo] } },
  build: {
    // The preload polyfill calls fetch(), which the site check forbids; every browser the site
    // targets supports modulepreload natively.
    modulePreload: { polyfill: false },
    // Never inline an asset as a data: URI; the CSP allows data: for images only, and a font
    // inlined into the CSS would be blocked.
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: { input: pages() },
  },
});
