import type { LintFile } from "@pbiplint/core";

/** One file read from a drop, a folder pick, or a directory input. Forward slashes, relative to the drop. */
export interface InputEntry {
  path: string;
  text: string;
}

/** What a reader saw: the files it read, and every .SemanticModel folder it passed, read or not. */
export interface InputTree {
  entries: InputEntry[];
  /**
   * Drop-relative paths of the .SemanticModel folders seen, whether or not they held a .tmdl file.
   * A folder is known by its name alone; nothing inside it is opened unless it is a wanted file.
   */
  modelFolders: string[];
}

export interface SelectedModel {
  /** Path of the model root inside the drop; "" when a lone file was dropped. */
  root: string;
  files: LintFile[];
  /** The nearest pbiplint.config.json at or above the model root, if the drop had one. */
  config?: { path: string; text: string };
  /** Sentences for under the results, such as a model folder in the drop that could not be linted. */
  notes: string[];
}

/** A problem with what was dropped, in words meant for the status line. */
export class InputError extends Error {}

export const CONFIG_FILE = "pbiplint.config.json";
const MODEL_SUFFIX = ".SemanticModel";
export const isModelFolder = (name: string): boolean => name.endsWith(MODEL_SUFFIX);

const TMDL_ONLY =
  "Only a model stored as TMDL can be linted; a model in the older model.bim format needs to be saved as TMDL from Power BI Desktop first.";

const parent = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const within = (path: string, dir: string): boolean => dir === "" || path.startsWith(dir + "/");
const relativeTo = (path: string, dir: string): string =>
  dir === "" ? path : path.slice(dir.length + 1);
const join = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`);
const depth = (dir: string): number => (dir === "" ? 0 : dir.split("/").length);

/**
 * A drop-relative path at or above the model root, written relative to the root the way a shell
 * would: "../pbiplint.config.json" for a config one folder up. For listing beside the model files.
 */
export function relativeToRoot(root: string, path: string): string {
  const dir = parent(path);
  if (within(path, root)) return relativeTo(path, root);
  return "../".repeat(depth(root) - depth(dir)) + relativeTo(path, dir);
}

/**
 * Mirrors the CLI's resolveModel on a tree of paths: a folder with a definition folder is the
 * model; else a folder holding exactly one .SemanticModel folder points at it; else every .tmdl
 * file under the folder is linted with paths relative to it.
 *
 * A .SemanticModel folder with no .tmdl files (an older model.bim model) holds nothing to lint, so
 * it never triggers the two-model refusal the CLI gives: the one lintable model is linted and the
 * other is named in a note. When it is the only model folder, the error names it instead.
 */
export function selectModel(entries: InputEntry[], modelFolders: string[] = []): SelectedModel {
  const tmdl = entries.filter((e) => e.path.endsWith(".tmdl"));
  const unlintable = modelFolders.filter((folder) => !tmdl.some((e) => within(e.path, folder)));
  const holdsNoTmdl = `${unlintable.join(", ")} hold${unlintable.length === 1 ? "s" : ""} no .tmdl files`;
  if (tmdl.length === 0)
    throw new InputError(
      unlintable.length
        ? `${holdsNoTmdl}. ${TMDL_ONLY}`
        : "No .tmdl files found. Drop a .SemanticModel folder, the PBIP folder that holds one, or a .tmdl file.",
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
  const notes = unlintable.length
    ? [`${holdsNoTmdl} and ${unlintable.length === 1 ? "was" : "were"} not linted. ${TMDL_ONLY}`]
    : [];
  return { root, files, config: findConfig(entries, root), notes };
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
        .filter(isModelFolder),
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
