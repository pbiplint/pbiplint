#!/usr/bin/env node
// Bundles the core for the browser and fails if the output references Node or network APIs.
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GERMAN_PROBE, mParserEsbuild } from "../build/m-parser-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, "../src/index.ts")],
  bundle: true,
  platform: "browser",
  format: "esm",
  minify: true,
  write: false,
  metafile: true,
  plugins: [mParserEsbuild],
  logLevel: "silent",
});
const code = result.outputFiles[0].text;
// The bundle's size in bytes, as the site serves it. The text's length counts UTF-16 code units;
// the two agree while esbuild writes each character outside ASCII as an escape, as it does by
// default, and the bytes stay right if that changes.
const size = result.outputFiles[0].contents.byteLength;
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
// The parser and its two dependencies (grapheme-splitter, and performance-now as the stub) apart
// from the core's own code, each against its own budget (v3 spec, section 3.4). They are matched
// by name, so any other dependency the core takes on counts against the core's own budget.
const PARSER_INPUT =
  /node_modules[\\/](?:@microsoft[\\/]powerquery-parser|grapheme-splitter)[\\/]|^pbiplint-performance-now:/;
const [output] = Object.values(result.metafile.outputs);
let parserBytes = 0;
let ownBytes = 0;
for (const [path, input] of Object.entries(output.inputs))
  if (PARSER_INPUT.test(path)) parserBytes += input.bytesInOutput;
  else ownBytes += input.bytesInOutput;
console.log(
  `core browser bundle: ${kb(size)} KB minified, ${kb(gzipSync(code).length)} KB gzipped; ` +
    `core's own code ${kb(ownBytes)} KB, the M parser ${kb(parserBytes)} KB`,
);

// Tripwires for conscious growth, raised on purpose: the core's own code at 265 KB and the parser at
// 385 KB, measured at 353.6 KB on 4.0.1 on October 31, 2026 (376.0 KB on 2.0.0); the parser moves
// only when its pinned version does. The core's budget was 210 KB (the v2 spec's amendment of October 4, 2026), then 230 KB for
// v3's first fifteen rules, Michael raised it to 240 KB on October 13, 2026, when the Desktop
// check's two changes measured 230.1 KB, it was raised to 245 KB on October 28, 2026, when a
// rule that cannot finish became a finding (#238) measured 239.9 KB, with 5 KB for 0.3.x (v3 spec,
// section 3.4), it was raised to 255 KB on October 29, 2026, when #98's PR 1 (message IDs)
// measured 249.7 KB, and it was raised to 265 KB on October 29, 2026, when #98's PR 2 (the native
// rules' templates) measured 257.0 KB; PR 3 moves the Power Query rules' templates in. If a later
// change crosses it, stop and tell the coordinator.
const OWN_LIMIT_KB = 265;
const PARSER_LIMIT_KB = 385;
let failed = false;
if (ownBytes > OWN_LIMIT_KB * 1024) {
  console.error(
    `the core's own code is ${kb(ownBytes)} KB minified, over the ${OWN_LIMIT_KB} KB budget`,
  );
  failed = true;
}
if (parserBytes > PARSER_LIMIT_KB * 1024) {
  console.error(
    `the M parser is ${kb(parserBytes)} KB minified, over the ${PARSER_LIMIT_KB} KB budget`,
  );
  failed = true;
}
if (code.includes(GERMAN_PROBE)) {
  console.error(
    "core bundle holds the parser's German messages: the English-only alias did not apply",
  );
  failed = true;
}
if (hits.length) {
  console.error(`core bundle references forbidden APIs: ${hits.join(", ")}`);
  failed = true;
}
if (failed) process.exit(1);
console.log("core bundle is browser-pure, English only, and within budget");
