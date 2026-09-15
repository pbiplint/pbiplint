import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cspPlugin } from "./src/build/csp.js";
import { generatePlugin } from "./src/build/generate.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  base: "/",
  plugins: [generatePlugin(), cspPlugin()],
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
  },
});
