import { emptyTree, isModelFolder, isReportFolder, type InputTree } from "./project-files.js";
import { depthCap, markerOf, MAX_DEPTH, SKIP_DIRS, unread, wanted } from "./read-drop.js";

// lib.dom does not type the File System Access API's picker or directory iteration, so the shape
// used here is declared locally. It matches Chrome and Edge.
interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}
interface DirectoryHandleLike {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
}
export type DirectoryPicker = (options?: { mode?: "read" }) => Promise<DirectoryHandleLike>;

/** Chrome and Edge have a folder picker; elsewhere this is null and the caller opens a directory input. */
export function directoryPicker(): DirectoryPicker | null {
  const w = window as unknown as { showDirectoryPicker?: DirectoryPicker };
  return typeof w.showDirectoryPicker === "function" ? w.showDirectoryPicker.bind(window) : null;
}

/**
 * Walks a picked folder. Null when the person closes the dialog without choosing. `onPicked` runs
 * once a folder is chosen and before any file is read, so the caller can say the read has begun
 * without saying it while the dialog is still open.
 */
export async function readPickedDirectory(
  pick: DirectoryPicker,
  onPicked?: () => void,
): Promise<InputTree | null> {
  let dir: DirectoryHandleLike;
  try {
    dir = await pick({ mode: "read" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
  onPicked?.();
  const tree = emptyTree();
  await walkHandle(dir, dir.name, tree);
  return tree;
}

async function walkHandle(
  dir: DirectoryHandleLike,
  prefix: string,
  tree: InputTree,
  depth = 0,
): Promise<void> {
  // Tested here rather than at the recursive call below, so the picked root is tested too: the
  // drop route's walkEntry checks the entry it is handed the same way. The depth clause sits here
  // for that same reason, so a cycle stops at the cap on the picked root's own path as well as on
  // its children. The skip comes first, so a folder that is never read raises no notice about
  // it. MAX_DEPTH, in read-drop.ts, says what the cap is for.
  if (SKIP_DIRS.has(dir.name)) return;
  if (depth >= MAX_DEPTH) {
    tree.diagnostics.push(depthCap(prefix));
    return;
  }
  if (isModelFolder(dir.name)) tree.modelFolders.push(prefix);
  if (isReportFolder(dir.name)) tree.reportFolders.push(prefix);
  // Stepped by hand rather than with for await, so only the listing's own failure names this
  // folder: a failure at the start or partway is a notice, what came before it is kept, and the
  // walk goes on with the folder's siblings.
  const listing = dir.values()[Symbol.asyncIterator]();
  for (;;) {
    let next: IteratorResult<FileHandleLike | DirectoryHandleLike>;
    try {
      next = await listing.next();
    } catch (e) {
      unread(tree, prefix, e, true);
      return;
    }
    if (next.done) return;
    const handle = next.value;
    const path = `${prefix}/${handle.name}`;
    if (handle.kind === "directory") {
      await walkHandle(handle, path, tree, depth + 1);
      continue;
    }
    // A legacy part is known by its marker's name; the marker itself is never opened.
    const marker = markerOf(path);
    if (marker) tree.markers.push(marker);
    else if (wanted(path)) {
      try {
        tree.entries.push({ path, text: await (await handle.getFile()).text() });
      } catch (e) {
        unread(tree, path, e);
      }
    }
  }
}

/**
 * This route sees paths rather than entries: a directory input enumerates hidden and nested
 * folders too, so the skip is applied to the segments of the reported path.
 */
const skipped = (path: string): boolean => path.split("/").some((seg) => SKIP_DIRS.has(seg));

/**
 * The folders a reported path passes through whose names `is` accepts, outermost first. A part
 * folder with no files at all is invisible on this route, unlike the drop and picker routes, which
 * walk directories; a real legacy part always has its one marker file, so this never shows in
 * practice.
 */
const foldersIn = (path: string, is: (name: string) => boolean): string[] => {
  const dirs = path.split("/").slice(0, -1);
  return dirs.flatMap((name, i) => (is(name) ? [dirs.slice(0, i + 1).join("/")] : []));
};

/** Adds each folder not already listed, keeping the order they were first seen in. */
const addNew = (list: string[], folders: string[]): void => {
  for (const folder of folders) if (!list.includes(folder)) list.push(folder);
};

/** Firefox and Safari: the files of an <input type="file" webkitdirectory>, with the paths the browser reports. */
export async function readDirectoryInput(input: HTMLInputElement): Promise<InputTree> {
  const tree = emptyTree();
  for (const file of [...(input.files ?? [])]) {
    const path = file.webkitRelativePath || file.name;
    if (skipped(path)) continue;
    // The cap by path depth (decision 8), so this route stops where the walkers stop: a file in
    // the folder MAX_DEPTH levels below the top is past it, and that folder is named once.
    const segments = path.split("/");
    if (segments.length - 1 > MAX_DEPTH) {
      const folder = segments.slice(0, MAX_DEPTH + 1).join("/");
      if (!tree.diagnostics.some((d) => d.kind === "depth-cap" && d.path === folder))
        tree.diagnostics.push(depthCap(folder));
      continue;
    }
    // The browser reports every file's path without opening it, so a part folder shows in the
    // segments even when nothing in it is read.
    addNew(tree.modelFolders, foldersIn(path, isModelFolder));
    addNew(tree.reportFolders, foldersIn(path, isReportFolder));
    const marker = markerOf(path);
    if (marker) tree.markers.push(marker);
    else if (wanted(path)) {
      try {
        tree.entries.push({ path, text: await file.text() });
      } catch (e) {
        unread(tree, path, e);
      }
    }
  }
  return tree;
}
