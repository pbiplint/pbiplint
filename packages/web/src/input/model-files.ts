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
  /**
   * Path of the model root inside the drop; "" when the drop has no folder above the files, which
   * is a lone file, or several dropped side by side.
   */
  root: string;
  files: LintFile[];
  /** The nearest pbiplint.config.json at or above the model root, if the drop had one. */
  config?: { path: string; text: string };
  /** Sentences for under the results, such as a model folder in the drop that could not be linted. */
  notes: string[];
  /**
   * Every file that was read, as a path relative to the model root, for listing under the results:
   * the linted files as they are, the config marked "(config)", and a .tmdl file read but outside
   * the model or its definition folder marked "(not linted)". A skipped file shows by its absence.
   */
  read: string[];
}

/** A problem with what was dropped, in words meant for the status line. */
export class InputError extends Error {
  // Error's own name otherwise, which says nothing in a console or a stack trace. The page matches
  // on the class, not on this.
  override name = "InputError";
}

export const CONFIG_FILE = "pbiplint.config.json";
const MODEL_SUFFIX = ".SemanticModel";
export const isModelFolder = (name: string): boolean => name.endsWith(MODEL_SUFFIX);

// The cause is offered, not asserted: the folder may as well be empty or half copied.
const TMDL_ONLY =
  "Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.";

/** "A", "A and B", "A, B, and C". */
const listOf = (items: string[]): string =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

const parent = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const within = (path: string, dir: string): boolean => dir === "" || path.startsWith(dir + "/");
const relativeTo = (path: string, dir: string): string =>
  dir === "" ? path : path.slice(dir.length + 1);
const join = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`);
/**
 * A drop-relative path written relative to the model root the way a shell would:
 * "../pbiplint.config.json" for a config one folder up, "../Other/x.tmdl" for a file beside the
 * root. For listing every file read beside the model files.
 */
export function relativeToRoot(root: string, path: string): string {
  const from = root === "" ? [] : root.split("/");
  const to = path.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  return "../".repeat(from.length - shared) + to.slice(shared).join("/");
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
  // "X holds no .tmdl files", built only when there is such a folder to name.
  const holdsNoTmdl = (): string =>
    `${listOf(unlintable)} hold${unlintable.length === 1 ? "s" : ""} no .tmdl files`;
  if (tmdl.length === 0)
    throw new InputError(
      unlintable.length
        ? `${holdsNoTmdl()}. ${TMDL_ONLY}`
        : "No .tmdl files found. Drop a .SemanticModel folder, the PBIP folder that holds one, or a .tmdl file.",
    );
  // The dropped folder is the first path segment of everything; a lone file has no folder.
  const firsts = new Set(entries.map((e) => e.path.split("/")[0]!));
  const base =
    firsts.size === 1 && entries.every((e) => e.path.includes("/")) ? [...firsts][0]! : "";
  const root = resolveRoot(tmdl, base);
  // Both are the same for every file, and hasDefinition walks the whole list, so asking once per
  // file made the filter quadratic in the number of .tmdl files.
  const definitionDir = join(root, "definition");
  const fromDefinition = hasDefinition(tmdl, root);
  const files = tmdl
    .filter((e) => within(e.path, root) && (!fromDefinition || within(e.path, definitionDir)))
    .map((e) => ({ path: relativeTo(e.path, root), text: e.text }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
  const notes = unlintable.length
    ? [`${holdsNoTmdl()} and ${unlintable.length === 1 ? "was" : "were"} not linted. ${TMDL_ONLY}`]
    : [];
  const config = findConfig(entries, root);
  const linted = new Set(files.map((f) => join(root, f.path)));
  const read = entries
    .map((e) => {
      const rel = relativeToRoot(root, e.path);
      if (e.path === config?.path) return `${rel} (config)`;
      if (e.path.endsWith(CONFIG_FILE)) return `${rel} (config, not used)`;
      return linted.has(e.path) ? rel : `${rel} (not linted)`;
    })
    .sort((a, b) => a.localeCompare(b, "en"));
  return { root, files, config, notes, read };
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
