#!/usr/bin/env node
// Starts the built bundle's MCP server as an app would, over real stdio, lints the bundled sample,
// and fails unless the findings come back. Runs after the build (npm run test:bundle).
import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, "../dist/pbiplint.mjs"), "mcp"], {
  stdio: ["pipe", "pipe", "inherit"],
});
const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const fail = (why) => {
  console.error(`MCP smoke test failed: ${why}`);
  child.kill();
  process.exit(1);
};
const timer = setTimeout(() => fail("no answer in 20 seconds"), 20_000);

let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const m = JSON.parse(buffer.slice(0, nl));
    buffer = buffer.slice(nl + 1);
    if (m.id === 1) {
      send({ method: "notifications/initialized" });
      send({
        id: 2,
        method: "tools/call",
        params: { name: "lint", arguments: { path: join(here, "../sample") } },
      });
    } else if (m.id === 2) {
      if (m.result?.isError) fail(m.result.content[0].text);
      const report = JSON.parse(m.result.content[0].text);
      if (!(report.summary.findings > 0)) fail("the sample gave no findings");
      clearTimeout(timer);
      console.log(`MCP smoke test: lint found ${report.summary.findings} findings in the sample`);
      child.stdin.end();
    }
  }
});
child.on("exit", (code) => {
  if (code !== 0) fail(`the server exited ${code}`);
});
send({
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  },
});
