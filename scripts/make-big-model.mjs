#!/usr/bin/env node
// Usage: node scripts/make-big-model.mjs <out>
// Writes <out>/big-model.SemanticModel, a model whose M is as heavy to parse as the corpus's slowest
// (v3 spec, section 11.5): 8 partitions of 6,250 #table rows each, about 400,000 tokens. The
// browser suite and the Node guard hold its lint to a budget. Nothing it writes is committed
// (.gitignore lists tests/generated/, where the suite puts it).
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PARTITIONS = 8;
export const ROWS = 6250;
const FOLDER = "big-model.SemanticModel";

/** One partition's table, its rows written one to a line as Desktop writes long M. */
function table(n) {
  const rows = Array.from(
    { length: ROWS },
    (_, i) => `\t\t\t\t\t\t{${i + 1}, "Row ${i + 1}", ${(i % 97) + 0.5}}${i + 1 < ROWS ? "," : ""}`,
  );
  return [
    `table 'Data ${n}'`,
    "\tcolumn Id",
    "\t\tdataType: int64",
    "\t\tformatString: 0",
    "\t\tsummarizeBy: none",
    "\t\tsourceColumn: Id",
    "",
    `\tpartition 'Data ${n}' = m`,
    "\t\tmode: import",
    "\t\tsource =",
    "\t\t\t\tlet",
    "\t\t\t\t    Source = #table(type table [Id = number, Name = text, Amount = number], {",
    ...rows,
    "\t\t\t\t    })",
    "\t\t\t\tin",
    "\t\t\t\t    Source",
    "",
  ].join("\n");
}

/** The model's files, as lint reads them. */
export function bigModelFiles() {
  return [
    { path: "definition/database.tmdl", text: "database\n\tcompatibilityLevel: 1702\n" },
    { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
    ...Array.from({ length: PARTITIONS }, (_, i) => ({
      path: `definition/tables/Data ${i + 1}.tmdl`,
      text: table(i + 1),
    })),
  ];
}

/** Writes the model under `out`, replacing an earlier copy, and returns its partition count. */
export function makeBigModel(out) {
  const root = join(resolve(out), FOLDER);
  // Only an earlier copy is ever replaced, so a slip of the argument cannot delete a real folder.
  if (existsSync(out) && readdirSync(out).some((name) => name !== FOLDER))
    throw new Error(`${out} holds more than an earlier big model; not writing into it`);
  rmSync(root, { recursive: true, force: true });
  for (const f of bigModelFiles()) {
    const path = join(root, f.path);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, f.text);
  }
  return PARTITIONS;
}

function main() {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node scripts/make-big-model.mjs <out>");
    process.exit(2);
  }
  console.log(`wrote ${makeBigModel(out)} M partitions to ${join(out, FOLDER)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main();
