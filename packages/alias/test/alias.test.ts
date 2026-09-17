import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Manifest {
  name: string;
  version: string;
  bin: Record<string, string>;
  files?: string[];
  exports?: unknown;
  dependencies?: Record<string, string>;
}

const read = (path: string): Manifest =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Manifest;

const inPackage = (path: string) => new URL(`../${path.replace(/^\.\//, "")}`, import.meta.url);

describe("the pbip-lint alias package", () => {
  it("ships the bin it declares, at the path it declares", () => {
    const declared = read("../package.json").bin["pbip-lint"] ?? "";
    expect(declared).not.toBe("");
    expect(existsSync(inPackage(declared))).toBe(true);
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
    const shim = read("../package.json").bin["pbip-lint"] ?? "";
    expect(readFileSync(inPackage(shim), "utf8")).toContain(`import "${specifier}";`);
  });

  // Reaching into pbiplint's dist is legal only while pbiplint has no exports map. The moment it
  // gets one, that path stops resolving and the shim dies on an ERR_PACKAGE_PATH_NOT_EXPORTED
  // stack. Published versions are pinned and immutable, so this guards the next alias release:
  // whoever adds an exports map to the CLI has to list the bin entry in it.
  it("depends on pbiplint declaring no exports map", () => {
    expect(read("../../cli/package.json").exports).toBeUndefined();
  });
});
