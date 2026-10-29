#!/usr/bin/env node
// Usage: node scripts/check-egress.mjs [--browser <path>]
//   (in CI's e2e job, after `npm run build -w @pbiplint/web -- --mode self-host`)
//
// Runs the egress check that ships with every release (packages/web/egress/egress-check.mjs) the
// way a firm runs it, twice. First against the self-hosting build in packages/web/dist, served by
// `vite preview`, where it must pass. Then against a page that loads an image from a second local
// origin, where it must fail and name that image, so a check that could never fail cannot pass
// here. The browser defaults to Playwright's Chromium, which the e2e job has already installed.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../packages/web/egress/egress-check.mjs", import.meta.url));

/** Listens on a free port and resolves with the server and its port. */
const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });

async function freePort() {
  const { server, port } = await listen(() => {});
  await new Promise((r) => server.close(r));
  return port;
}

async function waitFor(url) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} never answered`);
}

/**
 * Runs the check as a firm would, in its own process. Not spawnSync: the leaking page below is
 * served from this process, which could not answer the browser while blocked waiting.
 */
function run(url, browser) {
  return new Promise((resolve) => {
    // GitHub's Ubuntu runners refuse Chromium's sandbox, as Playwright's own launches know.
    const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
    const child = spawn(process.execPath, [script, url, "--browser", browser, ...sandbox]);
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill(), 240_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, output });
    });
  });
}

async function main() {
  const i = process.argv.indexOf("--browser");
  const browser =
    i > 0 ? process.argv[i + 1] : (await import("@playwright/test")).chromium.executablePath();
  let failed = false;

  // 1. The self-hosting build passes.
  const port = await freePort();
  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: `${repo}packages/web`, stdio: "ignore" },
  );
  try {
    await waitFor(`http://127.0.0.1:${port}/`);
    const pass = await run(`http://127.0.0.1:${port}/`, browser);
    console.log(pass.output);
    if (pass.status !== 0 || !pass.output.includes("0 requests left the origin.")) {
      console.error(`egress check against the self-hosting build exited ${pass.status}, not 0`);
      failed = true;
    }
  } finally {
    preview.kill();
  }

  // 2. A page that reaches off its origin fails, and the check names the request.
  const { server: elsewhere, port: otherPort } = await listen((_req, res) => res.end());
  const leak = `http://127.0.0.1:${otherPort}/pixel.png`;
  const page = `<!doctype html><title>leak</title><img src="${leak}" alt="">
<button id="try-sample" onclick="document.body.insertAdjacentHTML('beforeend','<div id=results><div class=group></div></div>')">Try</button>`;
  const { server: leaky, port: leakyPort } = await listen((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(page);
  });
  try {
    const fail = await run(`http://127.0.0.1:${leakyPort}/`, browser);
    console.log(fail.output);
    if (fail.status !== 1 || !fail.output.includes(leak)) {
      console.error(
        `egress check against a leaking page exited ${fail.status}, not 1 naming ${leak}`,
      );
      failed = true;
    }
  } finally {
    leaky.close();
    elsewhere.close();
  }

  if (failed) process.exit(1);
  console.log(
    "egress check: passes the self-hosting build and fails a page that leaves its origin",
  );
}

await main();
