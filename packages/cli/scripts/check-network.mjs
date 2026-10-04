#!/usr/bin/env node
// Fails if the built CLI bundle could reach the network: an import of any module outside the short
// list below, or a reference to a network API. The Privacy Promise says the command line makes no
// network request; this holds it to that the way check-browser-bundle.mjs holds the core.
// Reads dist/pbiplint.mjs, so it runs after the build; a path argument checks another file.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = process.argv[2] ?? join(here, "../dist/pbiplint.mjs");
if (!existsSync(bundle)) {
  console.error(`${bundle} does not exist; run npm run build first`);
  process.exit(1);
}
const code = readFileSync(bundle, "utf8");

// Everything the CLI uses from npm is bundled in, so every import left in the bundle is a Node
// builtin. An allowlist rather than a list of network modules: a new import fails here until
// someone has checked that it cannot reach the network and added it.
// node:process is the process object, which the MCP SDK's stdio transport imports by name.
const ALLOWED = new Set(["node:fs", "node:path", "node:process", "node:url"]);
// The bundle is not minified, so each static import or re-export starts a line, which keeps a
// rule's message that says `from "Sales"` from reading as one. A dynamic import or require is
// matched anywhere, as is esbuild's `__require`, which a bundled CommonJS dependency's require
// becomes, and one whose module is not a plain string cannot be checked, so it fails.
const SPECIFIERS = [
  /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/gm,
  /^\s*import\s*["']([^"']+)["']/gm,
  /\b(?:import|require|__require)\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const imports = new Set(SPECIFIERS.flatMap((re) => [...code.matchAll(re)].map((m) => m[1])));
const computed = /\b(?:import|require|__require)\s*\(\s*(?!["'][^"']+["']\s*\))/.test(code);
const notAllowed = [
  ...[...imports].filter((s) => !ALLOWED.has(s)).sort(),
  ...(computed ? ["a dynamic import or require of a computed name"] : []),
];

// The network APIs Node and the web platform put on the global object, as whole words.
const NETWORK_GLOBALS = ["fetch", "WebSocket", "XMLHttpRequest", "EventSource", "sendBeacon"];
const globals = NETWORK_GLOBALS.filter((name) => new RegExp(`\\b${name}\\b`).test(code));

console.log(`CLI bundle imports ${[...imports].sort().join(", ") || "nothing"}`);
if (notAllowed.length) {
  console.error(
    `CLI bundle imports modules this check does not allow: ${notAllowed.join(", ")}. ` +
      "Add one to ALLOWED in packages/cli/scripts/check-network.mjs only if it cannot reach the network.",
  );
}
if (globals.length) console.error(`CLI bundle references network APIs: ${globals.join(", ")}`);
if (notAllowed.length || globals.length) process.exit(1);
console.log("CLI bundle makes no network request");
