import type { LintFile } from "@pbiplint/core";

/** One file read from a drop, a folder pick, or a directory input. Forward slashes, relative to the drop. */
export interface InputEntry {
  path: string;
  text: string;
}

export interface SelectedModel {
  /** Path of the model root inside the drop; "" when a lone file was dropped. */
  root: string;
  files: LintFile[];
  /** The nearest pbiplint.config.json at or above the model root, if the drop had one. */
  config?: { path: string; text: string };
}

/** A problem with what was dropped, in words meant for the status line. */
export class InputError extends Error {}

export const CONFIG_FILE = "pbiplint.config.json";
const MODEL_SUFFIX = ".SemanticModel";

const parent = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const within = (path: string, dir: string): boolean => dir === "" || path.startsWith(dir + "/");
const relativeTo = (path: string, dir: string): string =>
  dir === "" ? path : path.slice(dir.length + 1);
const join = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`);

/**
 * Mirrors the CLI's resolveModel on a tree of paths: a folder with a definition folder is the
 * model; else a folder holding exactly one .SemanticModel folder points at it; else every .tmdl
 * file under the folder is linted with paths relative to it.
 *
 * A sibling .SemanticModel folder with no .tmdl files is invisible here, because only .tmdl files
 * and the config are ever read, so it never triggers the two-model refusal the CLI gives; the one
 * lintable model is linted.
 */
export function selectModel(entries: InputEntry[]): SelectedModel {
  const tmdl = entries.filter((e) => e.path.endsWith(".tmdl"));
  if (tmdl.length === 0)
    throw new InputError(
      "No .tmdl files found. Drop a .SemanticModel folder, the PBIP folder that holds one, or a .tmdl file.",
    );
  // The dropped folder is the first path segment of everything; a lone file has no folder.
  const firsts = new Set(entries.map((e) => e.path.split("/")[0]!));
  const base =
    firsts.size === 1 && entries.every((e) => e.path.includes("/")) ? [...firsts][0]! : "";
  const root = resolveRoot(tmdl, base);
  const files = tmdl
    .filter((e) => within(e.path, join(root, "definition")) || !hasDefinition(tmdl, root))
    .filter((e) => within(e.path, root))
    .map((e) => ({ path: relativeTo(e.path, root), text: e.text }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { root, files, config: findConfig(entries, root) };
}

const hasDefinition = (tmdl: InputEntry[], dir: string): boolean =>
  tmdl.some((e) => within(e.path, join(dir, "definition")));

function resolveRoot(tmdl: InputEntry[], dir: string): string {
  if (hasDefinition(tmdl, dir)) return dir;
  const models = [
    ...new Set(
      tmdl
        .filter((e) => within(e.path, dir))
        .map((e) => relativeTo(e.path, dir).split("/")[0]!)
        .filter((name) => name.endsWith(MODEL_SUFFIX)),
    ),
  ].sort();
  if (models.length === 1) return resolveRoot(tmdl, join(dir, models[0]!));
  if (models.length > 1)
    throw new InputError(
      `${dir || "The drop"} contains ${models.length} semantic models; drop one of them: ${models.join(", ")}`,
    );
  return dir;
}

/** The nearest config at or above `root`, walking up to the drop root, as the CLI walks up to the filesystem root. */
function findConfig(entries: InputEntry[], root: string): SelectedModel["config"] {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  for (let dir = root; ; dir = parent(dir)) {
    const hit = byPath.get(join(dir, CONFIG_FILE));
    if (hit) return { path: hit.path, text: hit.text };
    if (dir === "") return undefined;
  }
}
