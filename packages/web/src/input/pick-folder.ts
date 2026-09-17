import { isModelFolder, type InputTree } from "./model-files.js";
import { SKIP_DIRS, wanted } from "./read-drop.js";

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
  const tree: InputTree = { entries: [], modelFolders: [] };
  await walkHandle(dir, dir.name, tree);
  return tree;
}

async function walkHandle(
  dir: DirectoryHandleLike,
  prefix: string,
  tree: InputTree,
): Promise<void> {
  // Tested here rather than at the recursive call below, so the picked root is tested too: the
  // drop route's walkEntry checks the entry it is handed the same way.
  if (SKIP_DIRS.has(dir.name)) return;
  if (isModelFolder(dir.name)) tree.modelFolders.push(prefix);
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      if (wanted(handle.name))
        tree.entries.push({
          path: `${prefix}/${handle.name}`,
          text: await (await handle.getFile()).text(),
        });
    } else {
      await walkHandle(handle, `${prefix}/${handle.name}`, tree);
    }
  }
}

/**
 * This route sees paths rather than entries: a directory input enumerates hidden and nested
 * folders too, so the skip is applied to the segments of the reported path.
 */
const skipped = (path: string): boolean => path.split("/").some((seg) => SKIP_DIRS.has(seg));

/**
 * The .SemanticModel folders a reported path passes through, outermost first. A model folder with
 * no files at all is invisible on this route, unlike the drop and picker routes, which walk
 * directories; a real model.bim model always has its one file, so this never shows in practice.
 */
const modelFoldersIn = (path: string): string[] => {
  const dirs = path.split("/").slice(0, -1);
  return dirs.flatMap((name, i) => (isModelFolder(name) ? [dirs.slice(0, i + 1).join("/")] : []));
};

/** Firefox and Safari: the files of an <input type="file" webkitdirectory>, with the paths the browser reports. */
export async function readDirectoryInput(input: HTMLInputElement): Promise<InputTree> {
  const tree: InputTree = { entries: [], modelFolders: [] };
  for (const file of [...(input.files ?? [])]) {
    const path = file.webkitRelativePath || file.name;
    if (skipped(path)) continue;
    // The browser reports every file's path without opening it, so a model folder shows in the
    // segments even when nothing in it is read.
    for (const folder of modelFoldersIn(path))
      if (!tree.modelFolders.includes(folder)) tree.modelFolders.push(folder);
    if (wanted(file.name)) tree.entries.push({ path, text: await file.text() });
  }
  return tree;
}
