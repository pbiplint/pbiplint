import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP } from "../src/args.js";

// The README and the site's CLI page write options and paths in backticks and wrap their lines;
// the help text does neither. Comparing the prose without either is what lets one guard the other.
const prose = (url: URL): string =>
  readFileSync(url, "utf8").replace(/`/g, "").replace(/\s+/g, " ");

describe.each([
  ["the CLI README", new URL("../README.md", import.meta.url)],
  ["the site's CLI page", new URL("../../web/content/cli.md", import.meta.url)],
])("%s", (_name, url) => {
  const readme = prose(url);

  it("names every option the help text offers", () => {
    const options = [...new Set(HELP.match(/--[a-z][a-z-]*/g) ?? [])].sort();
    expect(options.length).toBeGreaterThan(5);
    expect(options.filter((o) => !readme.includes(o))).toEqual([]);
  });

  it("names every command the help text's usage lines give", () => {
    const commands = [...HELP.matchAll(/^(?:Usage:)?[ \t]+pbiplint ([a-z]+)/gm)].map((m) => m[1]!);
    expect(commands).toEqual(["rules", "explain", "reference", "skill", "mcp"]);
    expect(commands.filter((c) => !readme.includes(`pbiplint ${c}`))).toEqual([]);
  });

  it("names every level --fail-on takes", () => {
    const levels = /--fail-on <level>\s+(.+?):/
      .exec(HELP)![1]!
      .split(",")
      .map((s) => s.replace("(default)", "").trim());
    expect(levels).toEqual(["error", "warning", "info", "none"]);
    expect(levels.filter((l) => !readme.includes(`--fail-on ${l}`))).toEqual([]);
  });

  it("names every kind of path the help text accepts", () => {
    const paths = /^<path>\s+(.+)$/m
      .exec(HELP)![1]!
      .split(/,\s*(?:or\s+)?/)
      .map((s) => s.replace(/^(?:a|one)\s+/, "").trim());
    expect(paths).toEqual([
      "PBIP folder",
      ".pbip file",
      ".SemanticModel folder",
      ".Report folder",
      "definition folder",
      ".tmdl file",
    ]);
    expect(paths.filter((p) => !readme.includes(p))).toEqual([]);
  });

  it("says a folder that holds several projects is linted in one run, not refused (#237)", () => {
    expect(readme).toContain("holds several projects, pbiplint lints every one in one run");
    expect(readme).not.toMatch(/holds several (exits 2|is refused)/);
  });
});

/** Every Markdown page the site builds a content page from, as a path under packages/web/content. */
const contentPages = (
  dir = new URL("../../web/content/", import.meta.url),
  prefix = "",
): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? contentPages(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)
      : e.name.endsWith(".md")
        ? [`${prefix}${e.name}`]
        : [],
  );

/** The files the site build writes into public/ itself (packages/web/src/build/generate.ts). */
const BUILT_FILES = new Set(["/llms.txt", "/sitemap.xml"]);

/** Whether a path on the site is a page the build writes from these sources, or a file it serves. */
const builds = (written: string): boolean => {
  // A filter in the query, as in /rules/?layer=powerquery, is the same page; a folder written
  // without its trailing slash, as in https://pbiplint.com/rules, is served as that folder's page.
  const path = written.replace(/\?.*$/, "");
  const link = /\/[^/.]+$/.test(path) ? `${path}/` : path;
  if (link === "/") return existsSync(new URL("../../web/index.html", import.meta.url));
  if (link === "/rules/") return true;
  const rule = /^\/rules\/([a-z0-9-]+)\/$/.exec(link);
  if (rule) return existsSync(new URL(`../../../rules/${rule[1]}.md`, import.meta.url));
  const content = /^\/(.+)\/$/.exec(link);
  if (content) return existsSync(new URL(`../../web/content/${content[1]}.md`, import.meta.url));
  // Files the build writes into public/ (generate.ts), absent before a build, as in CI's tests.
  if (BUILT_FILES.has(link)) return true;
  return existsSync(new URL(`../../web/public${link}`, import.meta.url));
};
const sitePaths = (text: string): string[] =>
  [...text.matchAll(/\]\((\/[^)#]*)(?:#[^)]*)?\)/g)].map((m) => m[1]!);

describe("the site's content pages' links", () => {
  it.each(contentPages())(
    "%s links only to pages the site builds: the home page, the rules index, a content page, or a rule's page",
    (name) => {
      // Read from the sources the build writes pages from, so the check holds before any build runs.
      const page = readFileSync(new URL(`../../web/content/${name}`, import.meta.url), "utf8");
      expect(sitePaths(page).filter((link) => !builds(link))).toEqual([]);
    },
  );
  it("include the CLI page's, which links to several", () => {
    const page = readFileSync(new URL("../../web/content/cli.md", import.meta.url), "utf8");
    expect(sitePaths(page).length).toBeGreaterThan(3);
  });
  it("to pbiplint.com, in the content pages, the rule pages, and the READMEs, go to pages it builds", () => {
    const rules = new URL("../../../rules/", import.meta.url);
    const sources = [
      ...contentPages().map((n) => new URL(`../../web/content/${n}`, import.meta.url)),
      ...readdirSync(rules)
        .filter((f) => f.endsWith(".md"))
        .map((f) => new URL(f, rules)),
      new URL("../README.md", import.meta.url),
      new URL("../../../README.md", import.meta.url),
    ];
    const missing = sources.flatMap((url) =>
      [...readFileSync(url, "utf8").matchAll(/https:\/\/pbiplint\.com(\/[^\s)#>"`]*)/g)]
        // A sentence's closing stop or comma is not part of the address.
        .map((m) => m[1]!.replace(/[.,;:]+$/, ""))
        .filter((link) => !builds(link))
        .map((link) => `${url.pathname.split("/").slice(-2).join("/")}: ${link}`),
    );
    expect(missing).toEqual([]);
  });
});

describe("the CLI README", () => {
  it("names customRules in its configuration and points to the custom rules page", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const config = readme.slice(
      readme.indexOf("## Configuration"),
      readme.indexOf("## What it checks"),
    );
    expect(config).toContain("`customRules`");
    expect(config).toContain("https://pbiplint.com/custom-rules/");
  });
});
