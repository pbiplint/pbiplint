import { describe, expect, it } from "vitest";
import { packProblems } from "../check-pack.mjs";

const pack = (name, paths, version = "0.1.0") => ({
  name,
  version,
  files: paths.map((path) => ({ path })),
});
const core = (extra = []) =>
  pack("@pbiplint/core", [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/index.d.ts.map",
    "src/index.ts",
    ...extra,
  ]);
const cli = (extra = []) =>
  pack("pbiplint", [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/pbiplint.mjs",
    "sample/Messy Sales Demo.SemanticModel/definition/model.tmdl",
    "sample/Messy Sales Demo.SemanticModel/definition/tables/Sales.tmdl",
    "sample/Messy Sales Demo.Report/definition/report.json",
    "sample/Messy Sales Demo.pbip",
    "sample/pbiplint.config.json",
    ...extra,
  ]);

describe("packProblems", () => {
  it("passes the two packages as they ship today", () => {
    expect(packProblems([core(), cli()])).toEqual([]);
  });
  it("catches a forbidden file at any depth, not only at the package root", () => {
    // The core ships all of src, so a stray file deep in the tree has to be caught too.
    expect(packProblems([core(["src/config/.env.local"]), cli()])).toEqual([
      "@pbiplint/core: must not ship src/config/.env.local",
    ]);
    expect(packProblems([core(["src/rules/test/helper.ts"]), cli()])).toEqual([
      "@pbiplint/core: must not ship src/rules/test/helper.ts",
    ]);
  });
  it("fails on a package it does not know rather than checking nothing", () => {
    expect(packProblems([core(), pack("renamed-cli", ["package.json"])])).toEqual([
      "renamed-cli: not a package this check knows; add it to REQUIRED or stop packing it",
    ]);
  });
  it("still catches a missing file, a wrong count, and mismatched versions", () => {
    expect(packProblems([core()])).toEqual(["expected 2 packages, got 1"]);
    expect(packProblems([core(), pack("pbiplint", ["package.json"], "0.2.0")])).toEqual([
      "pbiplint: missing README.md",
      "pbiplint: missing LICENSE",
      "pbiplint: missing NOTICE",
      "pbiplint: missing dist/pbiplint.mjs",
      "pbiplint: missing sample/Messy Sales Demo.SemanticModel/definition/model.tmdl",
      "pbiplint: missing sample/Messy Sales Demo.SemanticModel/definition/tables/Sales.tmdl",
      "pbiplint: missing sample/Messy Sales Demo.Report/definition/report.json",
      "pbiplint: missing sample/Messy Sales Demo.pbip",
      "pbiplint: missing sample/pbiplint.config.json",
      "versions differ: 0.1.0, 0.2.0",
    ]);
  });
});
