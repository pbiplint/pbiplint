#!/usr/bin/env node
// Bundles the CLI (core included) into dist/pbiplint.mjs and copies the sample project next to it.
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const outfile = join(here, "dist/pbiplint.mjs");

await build({
  entryPoints: [join(here, "src/bin.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  alias: { "@pbiplint/core": join(here, "../core/src/index.ts") },
  define: { __PBIPLINT_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "info",
});

// The shebang is only useful if the file can be run directly, before npm links the bin.
chmodSync(outfile, 0o755);

rmSync(join(here, "sample"), { recursive: true, force: true });
mkdirSync(join(here, "sample"), { recursive: true });
cpSync(join(here, "../../examples/messy-sales"), join(here, "sample"), { recursive: true });
console.log("copied examples/messy-sales to packages/cli/sample");

// The vendored Microsoft ruleset is MIT-licensed; its notice ships with the package,
// as does pbiplint's own license, which lives at the repo root.
cpSync(join(here, "../../NOTICE"), join(here, "NOTICE"));
cpSync(join(here, "../../LICENSE"), join(here, "LICENSE"));
console.log("copied NOTICE and LICENSE to packages/cli");
