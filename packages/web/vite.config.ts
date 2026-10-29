import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { mParserVite } from "../core/build/m-parser-build.mjs";
import { buildInfoPlugin, versionPlugin } from "./src/build/build-info.js";
import { siteCheckPlugin } from "./src/build/check-site.js";
import { cspPlugin } from "./src/build/csp.js";
import { generatePlugin } from "./src/build/generate.js";
import { SELF_HOST_MODE, selfHostPlugin } from "./src/build/self-host.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

// Two builds of one commit: pbiplint.com's, and with `--mode self-host` the one a firm serves
// itself, which the release attaches as the site archive (issue #93).
export default defineConfig(({ mode }) => {
  const selfHost = mode === SELF_HOST_MODE;
  return {
    root,
    base: "/",
    plugins: [
      mParserVite(),
      generatePlugin({ selfHost }),
      cspPlugin(),
      buildInfoPlugin(),
      versionPlugin({ selfHost }),
      // Listed ahead of the site check, so the check reads the folder as it ships.
      ...(selfHost ? [selfHostPlugin()] : []),
      siteCheckPlugin({ build: selfHost ? "self-host" : "public" }),
    ],
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
  };
});
