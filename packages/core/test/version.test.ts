import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { skippedLine, topGroups, VERSION } from "../src/index.js";
import { lint } from "../src/engine/lint.js";

const manifest = (path: string): { version: string } =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

it("reports the version from package.json (run scripts/sync-version.mjs after a bump)", () => {
  expect(VERSION).toBe(manifest("../package.json").version);
});

it("is released in lockstep with the CLI", () => {
  expect(manifest("../../cli/package.json").version).toBe(manifest("../package.json").version);
});

it("declares the same Node floor as the workspace root, which require() of an ESM package needs", () => {
  const floor = (path: string): string =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).engines.node;
  // >=20 is not enough: require() of an ESM package resolves only on 20.19 or later.
  expect(floor("../package.json")).toBe("^20.19.0 || >=22.12.0");
  expect(floor("../../cli/package.json")).toBe("^20.19.0 || >=22.12.0");
  expect(floor("../../../package.json")).toBe("^20.19.0 || >=22.12.0");
});

it("exports the summary helpers the site shares with the text format", () => {
  const result = lint([{ path: "definition/model.tmdl", text: "model Model\n" }]);
  expect(skippedLine(result)).toMatch(/rules run/);
  expect(topGroups(result)).toEqual(result.groups.slice(0, 5));
  expect(topGroups(result, 0)).toEqual([]);
});
