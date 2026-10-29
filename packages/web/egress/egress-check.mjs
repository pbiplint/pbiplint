#!/usr/bin/env node
// pbiplint egress check: proves that a copy of the pbiplint site makes no request beyond its own
// address while a person uses it.
//
//   node egress-check.mjs <the site's address> [--browser <path to Chrome or Edge>] [--no-sandbox]
//
// --no-sandbox is for a Linux build agent that refuses the browser's sandbox. It turns off
// Chrome's own isolation of the page's process, so use it only where the sandbox cannot run, and
// only against your own copy, which is all the check opens.
//
// It opens the address in a Chrome or Edge already on this machine, headless and with a fresh
// profile, and watches every request the pages make from before the first one: the home page, a
// lint of the sample project built into the site, the rules index, one rule page, the pbiplint
// Privacy Promise, and the About page. It exits 0 when every request stayed on the site's own
// origin and nothing wrote a console error, 1 otherwise, listing what it saw, and 2 when it could
// not run the check at all (no browser, a bad address, a page that never loaded). Run it after
// every deploy and on a schedule, from any machine that can reach the site, such as a build agent.
//
// It needs Node 22 or later and nothing else: no npm install. It talks to the browser over the
// Chrome DevTools Protocol with Node's built-in WebSocket. A browser whose policy turns remote
// debugging off (RemoteDebuggingAllowed) cannot be driven this way; run it from a machine whose
// browser allows it.
//
// What it watches: the page, and every frame and worker the page starts, attached before each one
// runs. The site starts no workers today and its build check rejects service workers; a service
// worker would need watching too. Requests the browser itself makes outside any page, such as
// checking for its own updates, are not the site's, and are not counted.
//
// Part of pbiplint, https://github.com/pbiplint/pbiplint, under AGPL-3.0-or-later.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** True when `url` is a web or socket request to anywhere but `origin`. */
export function leavesOrigin(url, origin) {
  if (!/^(https?|wss?):/i.test(url)) return false;
  return new URL(url).origin !== new URL(origin).origin;
}

const USAGE =
  "Usage: node egress-check.mjs <the site's address> [--browser <path>] [--no-sandbox]\n" +
  "  --no-sandbox turns off Chrome's own process isolation: use it only where the sandbox cannot\n" +
  "  run, and only against your own copy, which is all the check opens.";

/** The address to check and, if given, the browser to check it with. */
export function parseArgs(argv) {
  let url;
  let browser;
  let noSandbox = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-sandbox") noSandbox = true;
    else if (arg === "--browser") {
      browser = argv[++i];
      if (!browser) throw new Error("--browser needs the path to Chrome or Edge");
    } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}. ${USAGE}`);
    else url = arg;
  }
  if (!url) throw new Error(USAGE);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }
  if (!parsed || !/^https?:$/.test(parsed.protocol))
    throw new Error(`The site's address must be an http or https URL, not "${url}"`);
  return { url, browser, noSandbox };
}

/** Where Chrome and Edge are usually installed on `platform`, Edge first. */
export function browserCandidates(platform, env) {
  if (platform === "win32") {
    const roots = [env["PROGRAMFILES(X86)"], env.PROGRAMFILES, env.LOCALAPPDATA].filter(Boolean);
    return [
      ...roots.map((r) => `${r}\\Microsoft\\Edge\\Application\\msedge.exe`),
      ...roots.map((r) => `${r}\\Google\\Chrome\\Application\\chrome.exe`),
    ];
  }
  if (platform === "darwin")
    return [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];
  return [
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
}

/** What Chrome and Edge print when policy turns remote debugging off. */
export const DEBUGGING_DISALLOWED = /DevTools remote debugging is disallowed/;
const LISTENING = /DevTools listening on (ws:\/\/\S+)/;

const STEP_TIMEOUT = 30_000;
/** How long to keep watching after a page loads, for anything it requests late. */
const SETTLE = 1_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Starts the browser and resolves with its DevTools address, or rejects saying why it cannot. */
function launch(browser, profile, noSandbox) {
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      // The browser's own traffic is not the site's and is not counted, but a firm watching its
      // firewall during the check would see it, so it is turned off where a switch allows.
      "--disable-background-networking",
      "--disable-component-update",
      // A Linux build agent whose kernel refuses the browser's sandbox (Ubuntu 24.04 restricts the
      // user namespaces it needs) cannot start it otherwise. The check loads only the site it is
      // pointed at, so this is offered as an option, never the default.
      ...(noSandbox ? ["--no-sandbox"] : []),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(
      () => reject(new Error(`${browser} did not open its DevTools port in 30 seconds`)),
      STEP_TIMEOUT,
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => {
      stderr += text;
      if (DEBUGGING_DISALLOWED.test(stderr)) {
        clearTimeout(timer);
        reject(
          new Error(
            "This browser's policy turns remote debugging off (RemoteDebuggingAllowed), so the check cannot drive it. Run the check from a machine whose browser allows it, such as a build agent, or name another browser with --browser.",
          ),
        );
      }
      const m = LISTENING.exec(stderr);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start ${browser}: ${e.message}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      // The reason is the browser's FATAL or ERROR line; a crash prints a stack dump after it.
      const lines = stderr.trim().split("\n");
      const reasons = lines.filter((l) => /FATAL|ERROR/.test(l));
      const said = (reasons.length ? reasons : lines).slice(-5).join("\n  ");
      reject(
        new Error(
          `${browser} exited (code ${code}) before opening its DevTools port${said ? `. It said:\n  ${said}` : ""}`,
        ),
      );
    });
  });
  return { child, endpoint };
}

/** A DevTools Protocol connection: send commands, and hear every event from every session. */
async function connect(endpoint, onEvent) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Could not reach the browser")), {
      once: true,
    });
  });
  let next = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.reject(new Error(message.error.message));
      else call?.resolve(message.result);
    } else onEvent(message);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return { send, close: () => socket.close() };
}

const running = (child) => child.exitCode === null && child.signalCode === null;

/** Ends the browser and removes its temporary profile; a profile it cannot remove is only reported. */
async function stop(child, profile) {
  if (running(child)) child.kill();
  await new Promise((r) => (running(child) ? child.once("exit", r) : r()));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    console.error(`Could not remove the temporary browser profile ${profile}: ${e.message}`);
  }
}

async function check(url, browser, noSandbox) {
  const origin = new URL(url).origin;
  // A Set, so a request every page repeats is listed once. A connection the site's policy blocks
  // (connect-src 'none') never becomes a request at all; the browser reports it as a console
  // error, which fails the check below.
  const offOrigin = new Set();
  const errors = [];
  const visited = [];
  const profile = mkdtempSync(join(tmpdir(), "pbiplint-egress-"));
  const { child, endpoint } = launch(browser, profile, noSandbox);
  // Interrupted (Ctrl+C, a cancelled pipeline), the browser and its profile still go.
  const interrupted = (signal) => {
    void stop(child, profile).then(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  let cdp;
  try {
    let loaded = () => {};
    cdp = await connect(await endpoint, (event) => {
      const { method, params } = event;
      if (method === "Network.requestWillBeSent") {
        if (leavesOrigin(params.request.url, origin)) offOrigin.add(params.request.url);
      } else if (method === "Network.webSocketCreated") {
        if (leavesOrigin(params.url, origin)) offOrigin.add(params.url);
      } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
        errors.push(params.args.map((a) => a.value ?? a.description ?? "").join(" "));
      } else if (method === "Runtime.exceptionThrown") {
        errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      } else if (method === "Log.entryAdded" && params.entry.level === "error") {
        errors.push(params.entry.text);
      } else if (method === "Page.loadEventFired") {
        loaded();
      } else if (method === "Target.attachedToTarget") {
        // A frame or worker the page started, paused before it runs until it is watched too.
        // A target can close before it is resumed; that is not a failure of the check.
        void watch(params.sessionId)
          .then(() => cdp.send("Runtime.runIfWaitingForDebugger", {}, params.sessionId))
          .catch(() => {});
      }
    });
    const watch = async (session) => {
      await Promise.allSettled([
        cdp.send("Network.enable", {}, session),
        cdp.send("Runtime.enable", {}, session),
        cdp.send("Log.enable", {}, session),
      ]);
      await cdp
        .send(
          "Target.setAutoAttach",
          { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
          session,
        )
        .catch(() => {});
    };
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId: page } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await watch(page);
    await cdp.send("Page.enable", {}, page);

    const evaluate = async (expression) =>
      (await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, page)).result.value;
    const until = async (expression, what) => {
      const end = Date.now() + STEP_TIMEOUT;
      while (!(await evaluate(expression))) {
        if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
        await sleep(200);
      }
    };
    const open = async (address) => {
      let timer;
      const load = new Promise((resolve, reject) => {
        loaded = resolve;
        timer = setTimeout(() => reject(new Error(`Timed out loading ${address}`)), STEP_TIMEOUT);
      });
      try {
        // A site that cannot be reached still loads, as the browser's error page, so the
        // navigation's own error is what says so.
        const { errorText } = await cdp.send("Page.navigate", { url: address }, page);
        if (errorText) throw new Error(`Could not load ${address}: ${errorText}`);
        await load;
      } finally {
        clearTimeout(timer);
      }
      await sleep(SETTLE);
      visited.push(address);
    };

    await open(new URL("/", url).href);
    const build = await evaluate(
      `document.querySelector('meta[name="pbiplint-build"]')?.content ?? ""`,
    );
    const version = await evaluate(
      `document.querySelector(".site-version")?.firstChild?.textContent.trim().replace(/\\.$/, "") ?? ""`,
    );
    await until(`!!document.querySelector("#try-sample")`, "the Try the sample project button");
    await evaluate(`document.querySelector("#try-sample").click()`);
    await until(`!!document.querySelector("#results .group")`, "the sample's results");
    await sleep(SETTLE);
    visited.push(`${new URL("/", url).href} (linted the sample project)`);
    await open(new URL("/rules/", url).href);
    const rule = await evaluate(
      `document.querySelector('a[href^="/rules/"][href$="/"]:not([href="/rules/"])')?.getAttribute("href") ?? ""`,
    );
    if (rule) await open(new URL(rule, url).href);
    await open(new URL("/privacy/", url).href);
    await open(new URL("/about/", url).href);
    return { build, version, visited, offOrigin: [...offOrigin], errors };
  } finally {
    await cdp?.send("Browser.close").catch(() => {});
    cdp?.close();
    await stop(child, profile);
  }
}

async function main() {
  if (typeof WebSocket === "undefined") {
    console.error(
      `The egress check needs Node 22 or later; this is Node ${process.versions.node}.`,
    );
    return 2;
  }
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const browser =
    args.browser ?? browserCandidates(process.platform, process.env).find((p) => existsSync(p));
  if (!browser) {
    console.error("No Chrome or Edge found in the usual places. Name one with --browser <path>.");
    return 2;
  }
  let result;
  try {
    result = await check(args.url, browser, args.noSandbox);
  } catch (e) {
    console.error(`The check could not finish: ${e.message}`);
    return 2;
  }
  const { build, version, visited, offOrigin, errors } = result;
  console.log(`pbiplint egress check of ${new URL(args.url).origin}`);
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`Browser: ${browser}`);
  console.log(`Site: ${version || "no version line found"}, build ${build || "unknown"}`);
  console.log("Visited:");
  for (const v of visited) console.log(`  ${v}`);
  if (offOrigin.length) {
    console.log(`FAIL: ${offOrigin.length} request(s) left the origin:`);
    for (const u of offOrigin) console.log(`  ${u}`);
  } else console.log("0 requests left the origin.");
  if (errors.length) {
    console.log(`FAIL: ${errors.length} console error(s):`);
    for (const e of errors) console.log(`  ${e}`);
  }
  if (!offOrigin.length && !errors.length) console.log("PASS");
  return offOrigin.length || errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
