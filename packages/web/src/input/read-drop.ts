import { isPbix, type Diagnostic } from "@pbiplint/core";
import {
  CONFIG_FILE,
  emptyTree,
  isModelFolder,
  isReportFolder,
  type InputMarker,
  type InputTree,
} from "./project-files.js";

/** A report's JSON: anything under the definition folder directly inside a .Report folder. */
const REPORT_JSON = /(^|\/)[^/]+\.Report\/definition\/.*\.json$/;

/**
 * Only these are ever read; everything else in a dropped folder stays unopened. Takes the
 * drop-relative path, since a report's JSON is known by the folders it sits in: a lone dropped
 * visual.json has no folder, so it is not wanted, which is right, as it is not a report.
 */
export const wanted = (path: string): boolean => {
  const name = path.split("/").pop() ?? path;
  return (
    name.endsWith(".tmdl") ||
    name === CONFIG_FILE ||
    name === "definition.pbir" ||
    name === ".platform" ||
    name.endsWith(".pbip") ||
    (name.endsWith(".json") && REPORT_JSON.test(path))
  );
};

/**
 * Folders never read, as the CLI skips them: Desktop's cache, git, packages, and a report's
 * resources and custom visuals, which hold nothing pbiplint lints and can be huge.
 */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".pbi",
  "node_modules",
  "StaticResources",
  "CustomVisuals",
]);

/**
 * How deep a folder walk goes. A drop or a picked folder is a tree today, since no browser follows
 * a symlink into one, but a cycle would otherwise walk on forever. Both walkers await before they
 * recurse, so every level resumes from the microtask queue and the synchronous stack unwinds
 * between levels; what grows without bound is the retained chain of suspended frames and promises,
 * so it is memory that gives out rather than the stack. The cap bounds depth, not total work: a
 * cycle with more than one directory per level still branches. That is the trade worth making
 * while no browser hands out a cycle at all. A real PBIP folder is under ten deep, so a genuine
 * project never reaches this; a walk that does is stopped with a `depth-cap` diagnostic naming
 * the folder, so what lies below it is never mistaken for clean.
 */
export const MAX_DEPTH = 64;

/** The `depth-cap` notice (spec section 4) for the folder a walk stopped in. */
export const depthCap = (folder: string): Diagnostic => ({
  kind: "depth-cap",
  path: folder,
  message: `the walk stopped ${MAX_DEPTH} folders deep at ${folder}, so files below it were not read`,
});

/**
 * The `unread-file` notice (spec section 4) for a file the browser would not hand over, or a folder
 * it would not list, in the CLI's words. The first one is also the tree's refusal. A path is named
 * once, as the CLI names it. The reason is the error's message: a DOMException is an Error. A
 * folder (`folder`) is recorded as one, since the notice cannot say so and lint needs to know.
 */
export function unread(tree: InputTree, path: string, e: unknown, folder = false): void {
  const reason = e instanceof Error ? e.message : String(e);
  tree.refusal ??= { path, reason };
  if (folder && !tree.unreadFolders.includes(path)) tree.unreadFolders.push(path);
  if (tree.diagnostics.some((d) => d.kind === "unread-file" && d.path === path)) return;
  tree.diagnostics.push({
    kind: "unread-file",
    path,
    message: `${path} could not be read (${reason}), so it was not linted`,
  });
}

/**
 * A legacy part's marker file, matched by the folder it sits in, or a .pbix, matched by its name
 * wherever it sits. Called on files only, so a folder named like a .pbix is not one.
 */
export const markerOf = (path: string): InputMarker | undefined => {
  if (isPbix(path)) return { path, kind: "pbix" };
  const m = /(^|\/)([^/]+\.(Report|SemanticModel))\/(report\.json|model\.bim)$/.exec(path);
  if (!m) return undefined;
  if (m[3] === "Report" && m[4] === "report.json") return { path, kind: "legacy-report" };
  if (m[3] === "SemanticModel" && m[4] === "model.bim") return { path, kind: "legacy-model" };
  return undefined;
};

/**
 * A file dropped on its own, read from its File: a failed read is a notice, and the drop goes on.
 * A .pbix is recorded by its name and never opened.
 */
async function readLoose(file: File, tree: InputTree): Promise<void> {
  const marker = markerOf(file.name);
  if (marker) {
    tree.markers.push(marker);
    return;
  }
  if (!wanted(file.name)) return;
  try {
    tree.entries.push({ path: file.name, text: await file.text() });
  } catch (e) {
    unread(tree, file.name, e);
  }
}

/**
 * Reads the wanted files out of a drop. The entries are taken from the DataTransfer before the
 * first await, because a DataTransfer is only readable while the drop event is being handled.
 */
export async function readDataTransfer(dt: DataTransfer): Promise<InputTree> {
  const tree = emptyTree();
  const items = [...dt.items].map((item) => ({
    entry: item.webkitGetAsEntry?.() ?? null,
    file: item.getAsFile?.() ?? null,
  }));
  if (items.some((i) => i.entry !== null)) {
    for (const { entry, file } of items) {
      if (!entry) continue;
      // A dropped file is already a File on its item; the entries API is needed only to walk a
      // folder. (WebKit hands out an entry even for a file that exists only in memory, and that
      // entry's file() fails, so the File itself is the safer read.)
      if (entry.isFile && file) await readLoose(file, tree);
      else await walkEntry(entry, tree);
    }
    return tree;
  }
  // No entries API: a flat list of files is all there is.
  for (const file of [...dt.files]) await readLoose(file, tree);
  return tree;
}

export async function walkEntry(entry: FileSystemEntry, tree: InputTree, depth = 0): Promise<void> {
  const path = entry.fullPath.replace(/^\//, "");
  if (entry.isFile) {
    // A legacy part is known by its marker's name, and a .pbix by its own; neither is opened.
    const marker = markerOf(path);
    if (marker) {
      tree.markers.push(marker);
      return;
    }
    if (!wanted(path)) return;
    try {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      tree.entries.push({ path, text: await file.text() });
    } catch (e) {
      unread(tree, path, e);
    }
    return;
  }
  // The skip is tested before the cap, so a folder that is never read raises no notice about it.
  if (!entry.isDirectory || SKIP_DIRS.has(entry.name)) return;
  if (depth >= MAX_DEPTH) {
    tree.diagnostics.push(depthCap(path));
    return;
  }
  // The folder's name says a part is there; whether it holds anything to read is known from the
  // walk below.
  if (isModelFolder(entry.name)) tree.modelFolders.push(path);
  if (isReportFolder(entry.name)) tree.reportFolders.push(path);
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands out a batch at a time (Chrome caps a batch at 100) and an empty batch at the
  // end. A batch that fails names the folder; what earlier batches held has been walked already.
  for (;;) {
    let batch: FileSystemEntry[];
    try {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
    } catch (e) {
      unread(tree, path, e, true);
      return;
    }
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, tree, depth + 1);
  }
}
