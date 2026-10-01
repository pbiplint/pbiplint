import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

// What Tabular Editor CLI 0.7.1.2 captured. That build stops working after October 31, 2026, so a
// missing or partial capture cannot be made again without a licensed build (docs/RELEASING.md).
const dir = fileURLToPath(new URL("../../tests/expectations/", import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));
/** The model fixtures with a capture in `sub`, by name. */
const names = (sub) =>
  readdirSync(join(dir, sub))
    .filter((f) => f.endsWith(".json") && !f.endsWith(".report.json") && f !== "files.json")
    .map((f) => f.slice(0, -".json".length))
    .sort();

describe("the survey's rule files", () => {
  const { files } = read("survey/files.json");
  it("lists the 46 distinct files once each, by id and by sha256", () => {
    expect(files).toHaveLength(46);
    expect(new Set(files.map((f) => f.id)).size).toBe(46);
    expect(new Set(files.map((f) => f.sha256)).size).toBe(46);
  });
  it("pins each file to a commit and a sha256, under an id made of its repository and path", () => {
    for (const f of files) {
      expect(f.id).toBe(`${f.repository}/${f.path}`);
      expect(f.commit, f.id).toMatch(/^[0-9a-f]{40}$/);
      expect(f.sha256, f.id).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(f.rules), f.id).toBe(true);
    }
  });
  it("records the 66 places the survey found them", () => {
    expect(files.reduce((n, f) => n + 1 + f.alsoAt.length, 0)).toBe(66);
  });
});

describe("the captures", () => {
  const fixtures = names("");
  const { files } = read("survey/files.json");
  it("cover every model fixture with Tabular Editor 3's built-in rules and the survey's files", () => {
    expect(fixtures).toContain("te3-zoo");
    expect(names("te3")).toEqual(fixtures);
    expect(names("survey")).toEqual(fixtures);
  });
  it.each(fixtures)("%s: all three come from te 0.7.1.2, on the same fixture", (name) => {
    const ms = read(`${name}.json`);
    for (const capture of [ms, read(`te3/${name}.json`), read(`survey/${name}.json`)]) {
      expect(capture.fixture).toBe(ms.fixture);
      expect(capture.oracle).toMatch(/^Tabular Editor CLI 0\.7\.1\.2[ ,]/);
    }
  });
  it.each(fixtures)("%s: the survey capture has a result for every listed file", (name) => {
    const { results } = read(`survey/${name}.json`);
    expect(Object.keys(results).sort()).toEqual(files.map((f) => f.id).sort());
  });
});
