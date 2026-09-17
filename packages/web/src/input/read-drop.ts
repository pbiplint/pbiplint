import { CONFIG_FILE, isModelFolder, type InputTree } from "./model-files.js";

/** Only these are ever read; everything else in a dropped folder stays unopened. */
export const wanted = (name: string): boolean => name.endsWith(".tmdl") || name === CONFIG_FILE;

/** Folders that never hold model files and can be huge (Desktop's cache, git objects). */
export const SKIP_DIRS: ReadonlySet<string> = new Set([".git", ".pbi", "node_modules"]);

/**
 * How deep a folder walk goes. A drop or a picked folder is a tree today, since no browser follows
 * a symlink into one, but a cycle would otherwise walk on forever. Both walkers await before they
 * recurse, so every level resumes from the microtask queue and the synchronous stack unwinds
 * between levels; what grows without bound is the retained chain of suspended frames and promises,
 * so it is memory that gives out rather than the stack. The cap bounds depth, not total work: a
 * cycle with more than one directory per level still branches. That is the trade worth making
 * while no browser hands out a cycle at all. A real PBIP folder is under ten deep, so a genuine
 * model never reaches this.
 */
export const MAX_DEPTH = 64;

/**
 * Reads the model files out of a drop. The entries are taken from the DataTransfer before the
 * first await, because a DataTransfer is only readable while the drop event is being handled.
 */
export async function readDataTransfer(dt: DataTransfer): Promise<InputTree> {
  const tree: InputTree = { entries: [], modelFolders: [] };
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
      if (entry.isFile && file) {
        if (wanted(file.name)) tree.entries.push({ path: file.name, text: await file.text() });
      } else await walkEntry(entry, tree);
    }
    return tree;
  }
  // No entries API: a flat list of files is all there is.
  for (const file of [...dt.files])
    if (wanted(file.name)) tree.entries.push({ path: file.name, text: await file.text() });
  return tree;
}

export async function walkEntry(entry: FileSystemEntry, tree: InputTree, depth = 0): Promise<void> {
  const path = entry.fullPath.replace(/^\//, "");
  if (entry.isFile) {
    if (!wanted(entry.name)) return;
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    tree.entries.push({ path, text: await file.text() });
    return;
  }
  if (!entry.isDirectory || SKIP_DIRS.has(entry.name) || depth >= MAX_DEPTH) return;
  // The folder's name says a model is there; whether it holds TMDL is known from the walk below.
  if (isModelFolder(entry.name)) tree.modelFolders.push(path);
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands out a batch at a time (Chrome caps a batch at 100) and an empty batch at the end.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, tree, depth + 1);
  }
}
