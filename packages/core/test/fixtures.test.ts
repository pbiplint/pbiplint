import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { lint, type LintResult } from "../src/engine/lint.js";
import { fixturesDir, readProjectFiles } from "./helpers.js";

/** Every file below `dir`, by its path from it with forward slashes. */
const listFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/"));

/** The committed project fixtures and the shape each one has (spec section 3.3). */
const PROJECTS = [
  { name: "base-rules-fails", pages: 18, visuals: 96, bookmarks: 2 },
  { name: "base-rules-passes", pages: 13, visuals: 74, bookmarks: 0 },
  { name: "pbip-and-github-demo", pages: 1, visuals: 19, bookmarks: 0 },
  { name: "shelfmart", pages: 1, visuals: 9, bookmarks: 0 },
  // The first Desktop check for the contrast rule, with hand-written themes (#182's spec, section 12).
  { name: "contrast-zoo", pages: 7, visuals: 94, bookmarks: 0 },
];

describe.each(PROJECTS)("project fixture $name", ({ name, pages, visuals, bookmarks }) => {
  const root = `${fixturesDir}${name}`;
  const files = readProjectFiles(root);
  let result: LintResult;
  beforeAll(async () => {
    result = await lint([...files.model, ...files.report]);
  });
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
  it("carries no resources but hand-written theme JSON, no caches, and no local paths", () => {
    // Only theme JSON directly in a theme folder: never an image, never Microsoft's own themes.
    const resources = `${root}/${files.reportFolder}/StaticResources`;
    const kept = existsSync(resources) ? listFiles(resources) : [];
    expect(
      kept.filter(
        (f) => !/^(RegisteredResources|SharedResources\/BaseThemes)\/[^/]+\.json$/.test(f),
      ),
    ).toEqual([]);
    expect(kept.filter((f) => /\/(CY\d{2}SU\d{2}|Fluent2-[^/]*)\.json$/.test(f))).toEqual([]);
    expect(existsSync(`${root}/${files.modelFolder}/.pbi`)).toBe(false);
    expect(files.model.some((f) => /File\.Contents\("(?!C:\\Demo\\Data\\)/.test(f.text))).toBe(
      false,
    );
  });
});
