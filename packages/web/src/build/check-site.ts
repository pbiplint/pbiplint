import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

export interface SiteReport {
  files: number;
  bytes: number;
  problems: string[];
}

/** Substrings that prove a script reaches for the network (or a service worker, which could). */
const NETWORK_APIS = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "EventSource",
  "navigator.serviceWorker",
  'import("http',
];
/** Elements that load something, with the attribute that names it. Anchors navigate; they are not resources. */
const RESOURCE_TAG = /<(script|link|img|iframe|video|audio|source|embed|object)\b[^>]*>/gi;
const OFF_ORIGIN = /^(https?:)?\/\//i;
const CSS_URL = /url\((["']?)((?:https?:)?\/\/[^)"']*)\1\)/gi;

export function checkSite(dir: string): SiteReport {
  const report: SiteReport = { files: 0, bytes: 0, problems: [] };
  for (const file of walk(dir).sort()) {
    const rel = relative(dir, file).split("\\").join("/");
    report.files++;
    report.bytes += statSync(file).size;
    if (rel.endsWith(".html")) checkHtml(rel, readFileSync(file, "utf8"), report);
    else if (rel.endsWith(".js") || rel.endsWith(".mjs"))
      checkScript(rel, readFileSync(file, "utf8"), report);
    else if (rel.endsWith(".css")) checkStyle(rel, readFileSync(file, "utf8"), report);
  }
  report.problems.sort();
  return report;
}

/**
 * The HTML parser decodes attribute entities before the browser reads the policy, and Vite writes
 * the injected meta with its quotes escaped, so read the attribute the way a browser would.
 */
function decodeAttribute(value: string): string {
  return value
    .replace(/&(?:#39|#x27|apos);/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");
}

function checkHtml(rel: string, html: string, report: SiteReport): void {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
  const csp = decodeAttribute(meta);
  if (!csp.includes("connect-src 'none'"))
    report.problems.push(`${rel}: no Content-Security-Policy meta with connect-src 'none'`);
  for (const tag of html.match(RESOURCE_TAG) ?? []) {
    if (/\brel="canonical"/.test(tag)) continue;
    const target = /\s(?:src|href)=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    if (OFF_ORIGIN.test(target)) report.problems.push(`${rel}: external resource ${tag}`);
  }
}

function checkScript(rel: string, code: string, report: SiteReport): void {
  for (const api of NETWORK_APIS)
    if (code.includes(api)) report.problems.push(`${rel}: references ${api}`);
}

function checkStyle(rel: string, css: string, report: SiteReport): void {
  for (const m of css.matchAll(CSS_URL)) report.problems.push(`${rel}: external ${m[0]}`);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Runs the check on the finished build and fails it on any problem, so a deploy can never ship a page that phones home. */
export function siteCheckPlugin(): Plugin {
  let outDir = "";
  return {
    name: "pbiplint-check-site",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const report = checkSite(outDir);
      console.log(`site: ${report.files} files, ${(report.bytes / 1024).toFixed(0)} KB`);
      if (report.problems.length)
        throw new Error(`site check failed:\n  ${report.problems.join("\n  ")}`);
      console.log("site check passed: CSP on every page, no external resources, no network APIs");
    },
  };
}
