import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Manifest {
  name: string;
  version: string;
  bin: Record<string, string>;
  dependencies?: Record<string, string>;
}

const read = (path: string): Manifest =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Manifest;

const shim = new URL("../bin/pbip-lint.mjs", import.meta.url);

describe("the pbip-lint alias package", () => {
  it("ships the bin its name resolves to", () => {
    expect(existsSync(shim)).toBe(true);
  });

  it("claims only the hyphenated bin, so both packages can be installed side by side", () => {
    expect(Object.keys(read("../package.json").bin)).toEqual(["pbip-lint"]);
  });

  it("is released at the same version as the command it stands in for", () => {
    expect(read("../package.json").version).toBe(read("../../cli/package.json").version);
  });

  it("pins that exact version, so the alias is never a moving target", () => {
    const alias = read("../package.json");
    expect(alias.dependencies?.pbiplint).toBe(alias.version);
  });

  it("imports the entry pbiplint declares as its bin", () => {
    const declared = read("../../cli/package.json").bin.pbiplint ?? "";
    expect(declared).not.toBe("");
    const specifier = `pbiplint/${declared.replace(/^\.\//, "")}`;
    expect(readFileSync(shim, "utf8")).toContain(`import "${specifier}";`);
  });
});
