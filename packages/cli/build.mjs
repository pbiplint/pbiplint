#!/usr/bin/env node
// Bundles the CLI (core included) into dist/pbiplint.mjs and copies the sample project next to it.
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

await build({
  entryPoints: [join(here, "src/bin.ts")],
  outfile: join(here, "dist/pbiplint.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  alias: { "@pbiplint/core": join(here, "../core/src/index.ts") },
  define: { __PBIPLINT_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "info",
});

rmSync(join(here, "sample"), { recursive: true, force: true });
mkdirSync(join(here, "sample"), { recursive: true });
cpSync(join(here, "../../examples/messy-sales"), join(here, "sample"), { recursive: true });
console.log("copied examples/messy-sales to packages/cli/sample");

// The vendored Microsoft ruleset is MIT-licensed; its notice ships with the package.
cpSync(join(here, "../../NOTICE"), join(here, "NOTICE"));
console.log("copied NOTICE to packages/cli/NOTICE");
