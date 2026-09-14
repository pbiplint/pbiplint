import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModel } from "../src/walk.js";

const repo = new URL("../../../", import.meta.url).pathname;

describe("resolveModel", () => {
  it("reads a .SemanticModel folder and reports paths relative to it with forward slashes", () => {
    const { root, files } = resolveModel(join(repo, "tests/fixtures/rule-zoo.SemanticModel"));
    expect(root.endsWith("rule-zoo.SemanticModel")).toBe(true);
    expect(files.map((f) => f.path)).toContain("definition/tables/Sales.tmdl");
    expect(files.every((f) => !f.path.includes("\\"))).toBe(true);
    expect(files.length).toBe(17);
  });
  it("accepts a PBIP folder with one semantic model, a definition folder, and a single file", () => {
    const pbip = mkdtempSync(join(tmpdir(), "pbiplint-"));
    mkdirSync(join(pbip, "Demo.SemanticModel", "definition", "tables"), { recursive: true });
    mkdirSync(join(pbip, "Demo.Report"), { recursive: true });
    writeFileSync(join(pbip, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    writeFileSync(join(pbip, "Demo.SemanticModel", "definition", "tables", "T.tmdl"), "table T\n");
    expect(
      resolveModel(pbip)
        .files.map((f) => f.path)
        .sort(),
    ).toEqual(["definition/model.tmdl", "definition/tables/T.tmdl"]);
    expect(
      resolveModel(join(pbip, "Demo.SemanticModel", "definition"))
        .files.map((f) => f.path)
        .sort(),
    ).toEqual(["model.tmdl", "tables/T.tmdl"]);
    expect(
      resolveModel(join(pbip, "Demo.SemanticModel", "definition", "tables", "T.tmdl")).files,
    ).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("explains what it could not find", () => {
    const empty = mkdtempSync(join(tmpdir(), "pbiplint-empty-"));
    expect(() => resolveModel(empty)).toThrow(/No semantic model found/);
    expect(() => resolveModel(join(empty, "missing"))).toThrow(/does not exist/);
  });
});
