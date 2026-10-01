import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

// What Tabular Editor CLI 0.7.1.2 captured. That build stops working after October 31, 2026, so a
// missing or partial capture cannot be made again without a licensed build (docs/RELEASING.md).
const dir = fileURLToPath(new URL("../../tests/expectations/", import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));

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
