import { readdirSync, readFileSync, statSync } from "node:fs";
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
  return rule.check(model, { indexes: buildIndexes(model) }).map((f) => f.objectName);
}

/** Read every .tmdl under `<root>/definition` (or under `<root>` when it is itself a definition folder). */
export function readModelFiles(root: string): { path: string; text: string }[] {
  const base = statSync(join(root, "definition"), { throwIfNoEntry: false })?.isDirectory()
    ? join(root, "definition")
    : root;
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
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

export const fixturesDir = new URL("../../../tests/fixtures/", import.meta.url).pathname;
export const examplesDir = new URL("../../../examples/", import.meta.url).pathname;
