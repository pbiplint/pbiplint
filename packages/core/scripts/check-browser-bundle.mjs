#!/usr/bin/env node
// Bundles the core for the browser and fails if the output references Node or network APIs. It
// bundles two entries: the core (src/index.ts) and the custom rules (src/custom-rules/index.ts),
// which the site loads only when a config names custom rules, so each is held to its own budget.
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GERMAN_PROBE, mParserEsbuild } from "../build/m-parser-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = async (entry) => {
  const result = await build({
    entryPoints: [join(here, "../src", entry)],
    bundle: true,
    platform: "browser",
    format: "esm",
    minify: true,
    write: false,
    metafile: true,
    plugins: [mParserEsbuild],
    logLevel: "silent",
  });
  const [output] = Object.values(result.metafile.outputs);
  return {
    code: result.outputFiles[0].text,
    // The bundle's size in bytes, as the site serves it. The text's length counts UTF-16 code
    // units; the two agree while esbuild writes each character outside ASCII as an escape, as it
    // does by default, and the bytes stay right if that changes.
    size: result.outputFiles[0].contents.byteLength,
    inputs: output.inputs,
  };
};
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
const forbiddenIn = (code) =>
  FORBIDDEN.filter(([, tokens]) => tokens.some((t) => code.includes(t))).map(([label]) => label);
const kb = (n) => (n / 1024).toFixed(1);
// The parser and its two dependencies (grapheme-splitter, and performance-now as the stub) apart
// from the core's own code, each against its own budget (v3 spec, section 3.4). They are matched
// by name, so any other dependency the core takes on counts against the core's own budget.
const PARSER_INPUT =
  /node_modules[\\/](?:@microsoft[\\/]powerquery-parser|grapheme-splitter)[\\/]|^pbiplint-performance-now:/;
// Anything under src/custom-rules/: the core's entry must reach none of it, so lint never carries
// the evaluator and the site downloads it only when a config names custom rules.
const CUSTOM_INPUT = /(?:^|[\\/])src[\\/]custom-rules[\\/]/;

const core = await bundle("index.ts");
let parserBytes = 0;
let ownBytes = 0;
for (const [path, input] of Object.entries(core.inputs))
  if (PARSER_INPUT.test(path)) parserBytes += input.bytesInOutput;
  else ownBytes += input.bytesInOutput;
console.log(
  `core browser bundle: ${kb(core.size)} KB minified, ${kb(gzipSync(core.code).length)} KB gzipped; ` +
    `core's own code ${kb(ownBytes)} KB, the M parser ${kb(parserBytes)} KB`,
);
const custom = await bundle("custom-rules/index.ts");
console.log(
  `custom rules browser bundle: ${kb(custom.size)} KB minified, ` +
    `${kb(gzipSync(custom.code).length)} KB gzipped`,
);

// Tripwires for conscious growth, raised on purpose: the core's own code at 300 KB and the parser at
// 385 KB, measured at 353.6 KB on 4.0.1 on October 31, 2026 (376.0 KB on 2.0.0); the parser moves
// only when its pinned version does. The core's budget was 210 KB (the v2 spec's amendment of
// October 4, 2026), then 230 KB for v3's first fifteen rules, Michael raised it to 240 KB on October 13, 2026, when the Desktop
// check's two changes measured 230.1 KB, it was raised to 245 KB on October 28, 2026, when a
// rule that cannot finish became a finding (#238) measured 239.9 KB, with 5 KB for 0.3.x (v3 spec,
// section 3.4), it was raised to 255 KB on October 29, 2026, when #98's PR 1 (message IDs)
// measured 249.7 KB, and it was raised to 265 KB on October 29, 2026, when #98's PR 2 (the native
// rules' templates) measured 257.0 KB; PR 3 moves the Power Query rules' templates in. It was
// raised to 295 KB on November 4, 2026, when the colour contrast rule (#182) measured 288.0 KB,
// with room for its coverage fact and the second Desktop check's defaults. It was raised to 300 KB
// on November 19, 2026, when the rule's coverage line and colour sample (#263) measured 295.4 KB on
// a main that had grown with pasted TMDL view scripts (#274): main alone 261.9 KB, with the rule
// 292.5 KB. It was raised to 310 KB on November 20, 2026, when custom rules' wiring in the engine
// and the four formats (#118, Tasks D1 to D5) measured 299.9 KB, from 296.9 KB on main; the room
// is for the CLI's reading of rule files and same-id handling still to come. The evaluator itself
// stays out of this bundle, in the custom rules entry below. If a later change crosses it, stop
// and tell the coordinator.
const OWN_LIMIT_KB = 310;
const PARSER_LIMIT_KB = 385;
// The custom rules entry (#118) has its own tripwire, on its whole minified bundle: the evaluator
// and the core code it shares with the main entry, which a bundle of both carries once. It was set
// at 130 KB on November 20, 2026, when the entry (the Tabular Editor reader, parser, evaluator,
// model view, and regular expression matcher) measured 111.7 KB minified, 34.8 KB gzipped; the
// room is for D2's fingerprint data, about 15 KB. The core's own code measured 296.9 KB before
// D's wiring and 297.5 KB with customRules in the config (Task D1). It was raised to 140 KB on
// November 20, 2026, when same-id handling (#118, Tasks D10 and D11) measured 132.0 KB minified,
// 40.6 KB gzipped, from 118.9 KB at the end of D1: the fingerprint data, 96 distinct
// fingerprints read from 129 file versions, is 12.0 KB of it, its ids being long, and the room is
// for regenerating that data as Microsoft and Tabular Editor publish new versions. The core's own
// code measured 301.7 KB with same-id handling in the engine. It was raised to 150 KB on November
// 20, 2026, when the reference of what a rule can use (#118, Tasks F1 and F2) measured 144.6 KB
// minified, 45.1 KB gzipped, from 132.1 KB: the tables lifted out of the evaluator took it to
// 133.5 KB, and the reference's own words (the operators', keywords', fields' and limits'
// meanings, the regular expression examples, and the code that walks the tables) are the rest.
// They are joined on in pure calls, so the site's custom rules chunk, which imports only
// readCustomRules, leaves them out: it measured 122.9 KB after F1 and after F2. The table of how
// values are written and the line on empty values took the entry to 146.7 KB minified, 45.8 KB
// gzipped, with the site's chunk still 122.9 KB. The room is for
// the reference growing as the evaluator does. If a later change crosses it, stop and tell the
// coordinator.
const CUSTOM_LIMIT_KB = 150;
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
if (custom.size > CUSTOM_LIMIT_KB * 1024) {
  console.error(
    `the custom rules entry is ${kb(custom.size)} KB minified, over the ${CUSTOM_LIMIT_KB} KB budget`,
  );
  failed = true;
}
const customInCore = Object.keys(core.inputs).filter((path) => CUSTOM_INPUT.test(path));
if (customInCore.length) {
  console.error(
    `core bundle reaches the custom rules, which belong in their own entry: ${customInCore.join(", ")}`,
  );
  failed = true;
}
if (core.code.includes(GERMAN_PROBE)) {
  console.error(
    "core bundle holds the parser's German messages: the English-only alias did not apply",
  );
  failed = true;
}
for (const [name, code] of [
  ["core bundle", core.code],
  ["custom rules bundle", custom.code],
]) {
  const hits = forbiddenIn(code);
  if (hits.length) {
    console.error(`${name} references forbidden APIs: ${hits.join(", ")}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("core and custom rules bundles are browser-pure, English only, and within budget");
