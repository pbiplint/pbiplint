import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { CONTROL_CHARACTER } from "./pages.js";

export interface SiteReport {
  files: number;
  bytes: number;
  problems: string[];
}

/** An opening tag, read the way a browser reads one. */
export interface Tag {
  /** The element name, lowercased. */
  name: string;
  /** The tag exactly as written, for the problem message. */
  raw: string;
  /** Attribute names lowercased, values as written; a valueless attribute maps to "". */
  attrs: Map<string, string>;
  /** True when the tag ran to the end of the file without ever closing. */
  unterminated: boolean;
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
/** Elements that load something. Anchors navigate; they are not resources. */
const RESOURCE_ELEMENTS = new Set([
  "script",
  "link",
  "img",
  "iframe",
  "video",
  "audio",
  "source",
  "embed",
  "object",
]);
/**
 * The attributes of those elements that name what gets loaded. `imagesrcset` belongs to a preload
 * link, `data` to an object, and `poster` to a video.
 */
const URL_ATTRS = ["src", "href", "srcset", "imagesrcset", "data", "poster"];
/** The ones holding a candidate list rather than a single URL. */
const SRCSET_ATTRS = new Set(["srcset", "imagesrcset"]);
/** An attribute that is an inline event handler. The CSP's script-src blocks these; this is hardening. */
const INLINE_HANDLER = /^on[a-z]{2,}$/;
const OFF_ORIGIN = /^(https?:)?\/\//i;
const CSS_URL = /url\((["']?)((?:https?:)?\/\/[^)"']*)\1\)/gi;
/** `@import "https://..."`, which CSS_URL misses because it names no url(). */
const CSS_IMPORT = /@import\s+(["'])(?:https?:)?\/\/[^"']*\1/gi;
/** A <style> block's contents, so an inline stylesheet gets the same checks as a file. */
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
/** Every candidate URL in a srcset: comma separated, each a URL and an optional descriptor. */
const srcsetCandidates = (value: string): string[] =>
  value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);

/** A tag short enough to read in a build failure. Only an unterminated one runs to the end of a file. */
const brief = (raw: string): string => (raw.length > 80 ? `${raw.slice(0, 80)}...` : raw);

/**
 * The element name at a `<`, which is what separates a tag from an angle bracket in prose. Sticky,
 * so it matches only where the scanner sets lastIndex and never further along the document.
 */
const TAG_NAME = /[a-z][^\s/>]*/iy;
/** One attribute: a name, then optionally a double-quoted, single-quoted, or bare value. */
const ATTR = /([^\s/>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;

/** A tag's attributes. A repeated name keeps its first value, as a browser does. */
const tagAttributes = (body: string): Map<string, string> => {
  const attrs = new Map<string, string>();
  for (const m of body.matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
};

/**
 * Every opening tag in a document, with its attributes parsed once. One scan that reads a value the
 * way a browser does beats a pattern per check, each carrying its own guess about quoting: whether
 * a value is quoted, and what it contains, stops mattering to everything downstream. Quoted runs
 * are skipped while looking for the tag's end, so a `>` inside a value does not truncate it.
 */
export function scanTags(html: string): Tag[] {
  const tags: Tag[] = [];
  for (let i = html.indexOf("<"); i !== -1; i = html.indexOf("<", i + 1)) {
    TAG_NAME.lastIndex = i + 1;
    if (!TAG_NAME.exec(html)) continue;
    const start = TAG_NAME.lastIndex;
    let end = start;
    let quote = "";
    while (end < html.length) {
      const char = html[end]!;
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      end++;
    }
    const unterminated = end === html.length;
    tags.push({
      name: html.slice(i + 1, start).toLowerCase(),
      raw: html.slice(i, unterminated ? end : end + 1),
      attrs: tagAttributes(html.slice(start, end)),
      unterminated,
    });
    i = end;
  }
  return tags;
}

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
  // Heading ids are made from heading text, so a repeated or empty one would break a deep link.
  const ids = new Set<string>();
  for (const tag of scanTags(html)) {
    // A tag that never closes would otherwise take its attributes out of every check below.
    if (tag.unterminated) report.problems.push(`${rel}: unterminated tag ${brief(tag.raw)}`);
    if ([...tag.attrs.keys()].some((name) => INLINE_HANDLER.test(name)))
      report.problems.push(`${rel}: inline event handler ${tag.raw}`);
    // style-src carries no unsafe-inline, so an inline style is as dead on the site as a handler.
    if (tag.name === "style" || tag.attrs.has("style"))
      report.problems.push(`${rel}: inline style ${tag.raw}`);
    if (RESOURCE_ELEMENTS.has(tag.name) && tag.attrs.get("rel") !== "canonical") {
      const targets = URL_ATTRS.flatMap((name) => {
        const value = tag.attrs.get(name);
        if (value === undefined) return [];
        return SRCSET_ATTRS.has(name) ? srcsetCandidates(value) : [value];
      });
      // One problem per tag, however many of its attributes reach off the origin.
      if (targets.some((target) => OFF_ORIGIN.test(target)))
        report.problems.push(`${rel}: external resource ${tag.raw}`);
    }
    const id = tag.attrs.get("id");
    if (id === "") report.problems.push(`${rel}: empty id on ${tag.raw}`);
    else if (id !== undefined) {
      if (ids.has(id)) report.problems.push(`${rel}: duplicate id "${id}"`);
      ids.add(id);
    }
  }
  // An inline stylesheet can reach off the origin exactly as a file can.
  for (const m of html.matchAll(STYLE_BLOCK)) checkStyle(rel, m[1]!, report);
  // The renderer writes a control character as a reference (CONTROL_CHARACTER in pages.ts), so
  // one that is here raw came from somewhere that does not, and, U+000C aside, which HTML reads
  // as whitespace, an HTML parser reports it as a parse error.
  for (const m of html.matchAll(CONTROL_CHARACTER)) {
    const code = m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
    const line = html.slice(0, m.index).split("\n").length;
    report.problems.push(`${rel}: raw control character U+${code} on line ${line}`);
  }
}

function checkScript(rel: string, code: string, report: SiteReport): void {
  for (const api of NETWORK_APIS)
    if (code.includes(api)) report.problems.push(`${rel}: references ${api}`);
}

function checkStyle(rel: string, css: string, report: SiteReport): void {
  for (const m of css.matchAll(CSS_URL)) report.problems.push(`${rel}: external ${m[0]}`);
  for (const m of css.matchAll(CSS_IMPORT)) report.problems.push(`${rel}: external ${m[0]}`);
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
