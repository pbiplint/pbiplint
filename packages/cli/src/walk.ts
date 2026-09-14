import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { LintFile } from "@pbiplint/core";
import { UsageError } from "./args.js";

export interface ResolvedModel {
  /** Absolute path finding locations are relative to. */
  root: string;
  files: LintFile[];
}

const toPosix = (p: string): string => p.split("\\").join("/");

function readTmdlFiles(root: string, dir: string, out: LintFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) readTmdlFiles(root, p, out);
    else if (entry.name.endsWith(".tmdl"))
      out.push({ path: toPosix(relative(root, p)), text: readFileSync(p, "utf8") });
  }
}

/** Find the semantic model at or under `input` and read its .tmdl files. */
export function resolveModel(input: string): ResolvedModel {
  const path = resolve(input);
  if (!existsSync(path)) throw new UsageError(`${input} does not exist`);
  const stat = statSync(path);
  if (stat.isFile()) {
    if (!path.endsWith(".tmdl")) throw new UsageError(`${input} is not a .tmdl file or a folder`);
    return {
      root: dirname(path),
      files: [{ path: basename(path), text: readFileSync(path, "utf8") }],
    };
  }
  if (existsSync(join(path, "definition")) && statSync(join(path, "definition")).isDirectory()) {
    const files: LintFile[] = [];
    readTmdlFiles(path, join(path, "definition"), files);
    if (files.length) return { root: path, files };
  }
  const models = readdirSync(path, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && e.name.endsWith(".SemanticModel"),
  );
  if (models.length === 1) return resolveModel(join(path, models[0]!.name));
  if (models.length > 1)
    throw new UsageError(
      `${input} contains ${models.length} semantic models; point at one of them: ${models.map((m) => m.name).join(", ")}`,
    );
  const direct: LintFile[] = [];
  readTmdlFiles(path, path, direct);
  if (direct.length) return { root: path, files: direct };
  throw new UsageError(
    `No semantic model found at ${input} (expected a .SemanticModel folder, a PBIP folder, a definition folder, or .tmdl files)`,
  );
}
