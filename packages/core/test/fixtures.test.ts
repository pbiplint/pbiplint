import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { fixturesDir, readProjectFiles } from "./helpers.js";

/** The committed project fixtures and the shape each one has (spec section 3.3). */
const PROJECTS = [
  { name: "base-rules-fails", pages: 18, visuals: 96, bookmarks: 2 },
  { name: "base-rules-passes", pages: 13, visuals: 74, bookmarks: 0 },
  { name: "pbip-and-github-demo", pages: 1, visuals: 19, bookmarks: 0 },
  { name: "shelfmart", pages: 1, visuals: 9, bookmarks: 0 },
];

describe.each(PROJECTS)("project fixture $name", ({ name, pages, visuals, bookmarks }) => {
  const root = `${fixturesDir}${name}`;
  const files = readProjectFiles(root);
  const result = lint([...files.model, ...files.report]);
  it("is a whole PBIP with both parts, read without parse issues, rule errors, or diagnostics", () => {
    expect(existsSync(root)).toBe(true);
    expect(files.modelFolder).toMatch(/\.SemanticModel$/);
    expect(files.reportFolder).toMatch(/\.Report$/);
    expect(result.layers.model.present && result.layers.report.present).toBe(true);
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
  it("has the pages, visuals, and bookmarks the spec counted", () => {
    const report = result.project.report!;
    expect(report.pages.length).toBe(pages);
    expect(report.pages.reduce((n, p) => n + p.visuals.length, 0)).toBe(visuals);
    expect(report.bookmarks.length).toBe(bookmarks);
  });
  it("carries no registered resources, caches, or local paths", () => {
    expect(existsSync(`${root}/${files.reportFolder}/StaticResources`)).toBe(false);
    expect(existsSync(`${root}/${files.modelFolder}/.pbi`)).toBe(false);
    expect(files.model.some((f) => /File\.Contents\("(?!C:\\Demo\\Data\\)/.test(f.text))).toBe(
      false,
    );
  });
});
