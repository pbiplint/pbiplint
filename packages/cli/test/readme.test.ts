import { readFileSync } from "node:fs";
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
    expect(commands).toEqual(["rules", "explain", "skill", "mcp"]);
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
});
