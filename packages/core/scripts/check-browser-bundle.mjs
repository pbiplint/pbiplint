#!/usr/bin/env node
// Bundles the core for the browser and fails if the output references Node or network APIs.
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, "../src/index.ts")],
  bundle: true,
  platform: "browser",
  format: "esm",
  minify: true,
  write: false,
  logLevel: "silent",
});
const code = result.outputFiles[0].text;
// Each entry is a label and the strings that prove the bundle reaches for that API. A Node
// builtin import always survives as a quoted module specifier (`from"node:fs"`), so the
// quotes are part of the token: a bare "node:" also matches an object property named `node`,
// which minification keeps, and the model tree has one.
const FORBIDDEN = [
  ["node:", ['"node:', "'node:"]],
  ["require(", ["require("]],
  ["process.", ["process."]],
  ["fetch(", ["fetch("]],
  ["XMLHttpRequest", ["XMLHttpRequest"]],
  ["__dirname", ["__dirname"]],
  ["WebSocket", ["WebSocket"]],
];
const hits = FORBIDDEN.filter(([, tokens]) => tokens.some((t) => code.includes(t))).map(
  ([label]) => label,
);
const kb = (n) => (n / 1024).toFixed(1);
console.log(
  `core browser bundle: ${kb(code.length)} KB minified, ${kb(gzipSync(code).length)} KB gzipped`,
);
if (hits.length) {
  console.error(`core bundle references forbidden APIs: ${hits.join(", ")}`);
  process.exit(1);
}
console.log("core bundle is browser-pure");
