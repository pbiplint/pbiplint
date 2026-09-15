import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSite } from "../src/build/check-site.js";
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
});
