import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP } from "../src/args.js";

// The README writes options and paths in backticks and wraps its lines; the help text does
// neither. Comparing the prose without either is what lets one guard the other.
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")
  .replace(/`/g, "")
  .replace(/\s+/g, " ");

describe("the CLI README", () => {
  it("names every option the help text offers", () => {
    const options = [...new Set(HELP.match(/--[a-z][a-z-]*/g) ?? [])].sort();
    expect(options.length).toBeGreaterThan(5);
    expect(options.filter((o) => !readme.includes(o))).toEqual([]);
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
      ".SemanticModel folder",
      "PBIP folder",
      "definition folder",
      ".tmdl file",
    ]);
    expect(paths.filter((p) => !readme.includes(p))).toEqual([]);
  });
});
