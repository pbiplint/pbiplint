import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSite, scanTags } from "../src/build/check-site.js";
import { CSP } from "../src/build/csp.js";

const META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pbiplint-dist-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

describe("checkSite", () => {
  it("passes a site whose pages carry the CSP and reference only their own origin", () => {
    const dir = site({
      "index.html": `<html><head>${META}<link rel="canonical" href="https://pbiplint.com/" /><link rel="stylesheet" href="/assets/a.css"></head><body><a href="https://github.com/pbiplint/pbiplint">GitHub</a><script type="module" src="/assets/a.js"></script></body></html>`,
      "rules/x/index.html": `<html><head>${META}</head><body><img src="/favicon.svg"></body></html>`,
      "assets/a.js": 'document.createElement("a");URL.createObjectURL(new Blob([""]));',
      "assets/a.css": "@font-face{src:url(/assets/inter.woff2)}",
      "sitemap.xml": "<urlset/>",
    });
    const report = checkSite(dir);
    expect(report.problems).toEqual([]);
    expect(report.files).toBe(5);
    expect(report.bytes).toBeGreaterThan(0);
  });
  it("reads the CSP the way a browser does, with the quotes escaped as Vite writes them", () => {
    const dir = site({
      "index.html": `<html><head><meta http-equiv="Content-Security-Policy" content="${CSP.replace(/'/g, "&#39;")}"></head><body></body></html>`,
    });
    expect(checkSite(dir).problems).toEqual([]);
  });
  it("names a page whose element ids repeat or are empty, so every anchor stays linkable", () => {
    const dir = site({
      "index.html": `<html><head>${META}</head><body><h2 id="verify">A</h2><p id="status"></p></body></html>`,
      "d/index.html": `<html><head>${META}</head><body><h2 id="quirks">A</h2><h2 id="quirks">B</h2><h3 id="">C</h3></body></html>`,
    });
    expect(checkSite(dir).problems).toEqual([
      'd/index.html: duplicate id "quirks"',
      'd/index.html: empty id on <h3 id="">',
    ]);
  });
  it("names every page that lacks the CSP or reaches off the origin, and every script or style that could", () => {
    const dir = site({
      "index.html": `<html><head></head><body></body></html>`,
      "a/index.html": `<html><head>${META}<script src="https://cdn.example/x.js"></script></head></html>`,
      "b/index.html": `<html><head>${META}<link rel="stylesheet" href="//fonts.example/x.css"></head></html>`,
      "c/index.html": `<html><head>${META}</head><body><img src="https://img.example/x.png"></body></html>`,
      "assets/f.js": 'fetch("/x")',
      "assets/x.js": "new XMLHttpRequest()",
      "assets/b.js": "navigator.sendBeacon(u)",
      "assets/w.js": "new WebSocket(u)",
      "assets/s.js": "navigator.serviceWorker.register(u)",
      "assets/a.css": "@font-face{src:url(https://fonts.gstatic.com/x.woff2)}",
      "assets/i.css": '@import url("https://x.example/y.css");',
    });
    const { problems } = checkSite(dir);
    expect(problems).toEqual([
      'a/index.html: external resource <script src="https://cdn.example/x.js">',
      "assets/a.css: external url(https://fonts.gstatic.com/x.woff2)",
      "assets/b.js: references sendBeacon",
      "assets/f.js: references fetch(",
      'assets/i.css: external url("https://x.example/y.css")',
      "assets/s.js: references navigator.serviceWorker",
      "assets/w.js: references WebSocket",
      "assets/x.js: references XMLHttpRequest",
      'b/index.html: external resource <link rel="stylesheet" href="//fonts.example/x.css">',
      'c/index.html: external resource <img src="https://img.example/x.png">',
      "index.html: no Content-Security-Policy meta with connect-src 'none'",
    ]);
  });
  it("names an inline handler, a bare @import, a srcset, an unquoted attribute, and an inline style", () => {
    const dir = site({
      "index.html": `<html><head>${META}</head><body><button onclick="go()">x</button></body></html>`,
      "a/index.html": `<html><head>${META}</head><body><img srcset="https://img.example/x.png 2x, /favicon.svg 1x"></body></html>`,
      "b/index.html": `<html><head>${META}</head><body><script src=https://cdn.example/x.js></script></body></html>`,
      "c/index.html": `<html><head>${META}<style>@import "https://fonts.example/x.css";</style></head></html>`,
      "assets/a.css": '@import "https://fonts.example/y.css";',
    });
    expect(checkSite(dir).problems).toEqual([
      'a/index.html: external resource <img srcset="https://img.example/x.png 2x, /favicon.svg 1x">',
      'assets/a.css: external @import "https://fonts.example/y.css"',
      "b/index.html: external resource <script src=https://cdn.example/x.js>",
      'c/index.html: external @import "https://fonts.example/x.css"',
      'index.html: inline event handler <button onclick="go()">',
    ]);
  });
  it("reads attribute names, so an = inside rule prose is not mistaken for a handler", () => {
    const dir = site({
      "index.html": `<html><head>${META}<meta name="description" content="Set only = TRUE to keep it." /></head><body></body></html>`,
      "a/index.html": `<html><head>${META}</head><body><button onclick="go()">x</button></body></html>`,
    });
    expect(checkSite(dir).problems).toEqual([
      'a/index.html: inline event handler <button onclick="go()">',
    ]);
  });
  it("reads every unquoted attribute on a tag, not only the first", () => {
    const dir = site({
      "index.html": `<html><head>${META}</head><body><img src=/a.png srcset=https://evil.example/x.png></body></html>`,
    });
    expect(checkSite(dir).problems).toEqual([
      "index.html: external resource <img src=/a.png srcset=https://evil.example/x.png>",
    ]);
  });
});

describe("scanTags", () => {
  it("reads a double-quoted, single-quoted, bare, and valueless attribute", () => {
    const [tag] = scanTags(`<img src="/a.png" alt='x' width=32 hidden>`);
    expect(tag?.name).toBe("img");
    expect([...(tag?.attrs ?? [])]).toEqual([
      ["src", "/a.png"],
      ["alt", "x"],
      ["width", "32"],
      ["hidden", ""],
    ]);
  });
  it("does not end a tag at a > inside a quoted value", () => {
    const [tag] = scanTags(`<img alt="a>b" src="https://evil.example/x.png">`);
    expect(tag?.attrs.get("src")).toBe("https://evil.example/x.png");
    expect(tag?.raw).toBe(`<img alt="a>b" src="https://evil.example/x.png">`);
  });
  it("reads an unquoted value containing a quote as one value, so the next name is still a name", () => {
    const [tag] = scanTags(`<div x=a="b onclick=" y>`);
    expect([...(tag?.attrs.keys() ?? [])]).toEqual(["x", "onclick", "y"]);
  });
  it("keeps an = inside a quoted value out of the attribute names", () => {
    const [tag] = scanTags(`<meta name="description" content="Set only = TRUE to keep it." />`);
    expect([...(tag?.attrs.keys() ?? [])]).toEqual(["name", "content"]);
  });
  it("lowercases the element name and every attribute name", () => {
    const [tag] = scanTags(`<IMG SrcSet="/a.png">`);
    expect(tag?.name).toBe("img");
    expect(tag?.attrs.get("srcset")).toBe("/a.png");
  });
  it("marks a tag that never closes as unterminated", () => {
    const [tag] = scanTags(`<img src="/a.png"`);
    expect(tag?.unterminated).toBe(true);
  });
  it("marks a closed tag terminated", () => {
    const [tag] = scanTags(`<img src="/a.png">`);
    expect(tag?.unterminated).toBe(false);
  });
  it("reads no tag from a < that starts none", () => {
    expect(scanTags("a < b, and 3<4")).toEqual([]);
  });
  it("resumes after a tag, so a < inside a value starts nothing", () => {
    expect(scanTags(`<img alt="a<b"><p id="x">`).map((t) => t.name)).toEqual(["img", "p"]);
  });
});
