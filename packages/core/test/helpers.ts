import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import type { Rule } from "../src/rules/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import type { ParsedFile } from "../src/tmdl/types.js";

export function modelFrom(tmdl: string): Model {
  return buildModel([parseTmdl("inline.tmdl", tmdl)]);
}

/** Run one rule on inline TMDL and return the object names it flags, in emission order. */
export function objectNames(rule: Rule, tmdl: string): string[] {
  const model = modelFrom(tmdl);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }), options: {} })
    .map((f) => f.objectName);
}

/** Read every .tmdl under `<root>/definition` (or under `<root>` when it is itself a definition folder). */
export function readModelFiles(root: string): { path: string; text: string }[] {
  const base = statSync(join(root, "definition"), { throwIfNoEntry: false })?.isDirectory()
    ? join(root, "definition")
    : root;
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    )) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".tmdl"))
        out.push({ path: relative(root, p).split("\\").join("/"), text: readFileSync(p, "utf8") });
    }
  };
  walk(base);
  return out;
}

export function parseModelDir(root: string): ParsedFile[] {
  return readModelFiles(root).map((f) => parseTmdl(f.path, f.text));
}

/** A PBIP folder's two parts as the CLI would read them, for tests that cannot import the CLI. */
export function readProjectFiles(root: string): {
  model: { path: string; text: string }[];
  report: { path: string; text: string }[];
  modelFolder?: string;
  reportFolder?: string;
} {
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const modelFolder = dirs.find((d) => d.endsWith(".SemanticModel"));
  const reportFolder = dirs.find((d) => d.endsWith(".Report"));
  const model = modelFolder ? readModelFiles(join(root, modelFolder)) : [];
  const report: { path: string; text: string }[] = [];
  if (reportFolder) {
    const base = join(root, reportFolder);
    for (const name of ["definition.pbir", ".platform"])
      if (existsSync(join(base, name)))
        report.push({ path: name, text: readFileSync(join(base, name), "utf8") });
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name, "en"),
      )) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".json"))
          report.push({
            path: relative(base, p).split("\\").join("/"),
            text: readFileSync(p, "utf8"),
          });
      }
    };
    walk(join(base, "definition"));
    // The CLI rides the project's .pbip in the report part by its path relative to the report
    // root, one level up, so a finding on it points at the real file.
    const pbip = readdirSync(root).find((n) => n.endsWith(".pbip"));
    if (pbip) report.push({ path: `../${pbip}`, text: readFileSync(join(root, pbip), "utf8") });
  }
  return { model, report, modelFolder, reportFolder };
}

export const fixturesDir = new URL("../../../tests/fixtures/", import.meta.url).pathname;
export const examplesDir = new URL("../../../examples/", import.meta.url).pathname;
