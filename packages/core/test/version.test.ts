import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { plural, skippedLine, topGroups, VERSION } from "../src/index.js";
import { lint } from "../src/engine/lint.js";
import { examplesDir, readModelFiles } from "./helpers.js";

const manifest = (path: string): { version: string } =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

it("reports the version from package.json (run scripts/sync-version.mjs after a bump)", () => {
  expect(VERSION).toBe(manifest("../package.json").version);
});

it("is released in lockstep with the CLI", () => {
  expect(manifest("../../cli/package.json").version).toBe(manifest("../package.json").version);
});

it("is the version the README's Status section names (update it in the release commit)", () => {
  // The README front page says which version is out. Nothing regenerates that line, and two
  // patch releases went by with it still naming 0.1.0, so the release checks pin it here.
  const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
  const status = readme.split("\n").find((line) => line.startsWith("Version "));
  const version = manifest("../package.json").version.replaceAll(".", "\\.");
  expect(status).toMatch(new RegExp(`^Version ${version}\\b`));
});

it("declares the same Node floor as the workspace root, which require() of an ESM package needs", () => {
  // >=20 is not enough: require() of an ESM package resolves only on 20.19 or later.
  const NODE_FLOOR = "^20.19.0 || >=22.12.0";
  const floor = (path: string): string =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).engines.node;
  expect(floor("../package.json")).toBe(NODE_FLOOR);
  expect(floor("../../cli/package.json")).toBe(NODE_FLOOR);
  expect(floor("../../../package.json")).toBe(NODE_FLOOR);
  // The lockfile keeps its own copy of engines for each workspace, and npm ci never compares the
  // copy to the manifest, so the two drift in silence until a release runs npm install and
  // rewrites them as noise inside the release commit.
  const lock = JSON.parse(
    readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
  );
  expect(lock.packages["packages/core"].engines.node).toBe(NODE_FLOOR);
  expect(lock.packages["packages/cli"].engines.node).toBe(NODE_FLOOR);
  // The root workspace carries its own copy too, and drifts the same way the other two did.
  expect(lock.packages[""].engines.node).toBe(NODE_FLOOR);
});

it('exports the plural helper, so the site says "1 file" the way the text format does', () => {
  expect(plural(1, "file")).toBe("1 file");
  expect(plural(2, "file")).toBe("2 files");
  expect(plural(0, "file")).toBe("0 files");
});

it("exports the summary helpers the site shares with the text format", () => {
  // The sample ranks fourteen groups, so the cap is what makes this a list of five rather than
  // all of them. A model with fewer groups than the cap cannot tell the two apart, which is what
  // the earlier fixture here did.
  const result = lint(readModelFiles(join(examplesDir, "messy-sales")));
  expect(skippedLine(result)).toMatch(/rules run/);
  expect(result.groups.length).toBeGreaterThan(5);
  // The five the site puts under "Fix these first" and the text format prints at the top, in rank
  // order: severity, then category, then count.
  expect(topGroups(result).map((g) => g.rule.id)).toEqual([
    "DAX_COLUMNS_FULLY_QUALIFIED",
    "PROVIDE_FORMAT_STRING_FOR_MEASURES",
    "AVOID_FLOATING_POINT_DATA_TYPES",
    "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE",
    "MODEL_SHOULD_HAVE_A_DATE_TABLE",
  ]);
  expect(topGroups(result, 2).map((g) => g.rule.id)).toEqual([
    "DAX_COLUMNS_FULLY_QUALIFIED",
    "PROVIDE_FORMAT_STRING_FOR_MEASURES",
  ]);
  expect(topGroups(result, 0)).toEqual([]);
});
