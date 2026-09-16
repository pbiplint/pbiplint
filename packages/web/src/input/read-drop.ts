import { CONFIG_FILE, isModelFolder, type InputTree } from "./model-files.js";

/** Only these are ever read; everything else in a dropped folder stays unopened. */
export const wanted = (name: string): boolean => name.endsWith(".tmdl") || name === CONFIG_FILE;

/** Folders that never hold model files and can be huge (Desktop's cache, git objects). */
export const SKIP_DIRS: ReadonlySet<string> = new Set([".git", ".pbi", "node_modules"]);

/**
 * Reads the model files out of a drop. The entries are taken from the DataTransfer before the
 * first await, because a DataTransfer is only readable while the drop event is being handled.
 */
export async function readDataTransfer(dt: DataTransfer): Promise<InputTree> {
  const tree: InputTree = { entries: [], modelFolders: [] };
  const entries = [...dt.items].map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.some((e) => e !== null)) {
    for (const entry of entries) if (entry) await walkEntry(entry, tree);
    return tree;
  }
  // No entries API: a flat list of files is all there is.
  for (const file of [...dt.files])
    if (wanted(file.name)) tree.entries.push({ path: file.name, text: await file.text() });
  return tree;
}

export async function walkEntry(entry: FileSystemEntry, tree: InputTree): Promise<void> {
  const path = entry.fullPath.replace(/^\//, "");
  if (entry.isFile) {
    if (!wanted(entry.name)) return;
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    tree.entries.push({ path, text: await file.text() });
    return;
  }
  if (!entry.isDirectory || SKIP_DIRS.has(entry.name)) return;
  // The folder's name says a model is there; whether it holds TMDL is known from the walk below.
  if (isModelFolder(entry.name)) tree.modelFolders.push(path);
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands out a batch at a time (Chrome caps a batch at 100) and an empty batch at the end.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, tree);
  }
}
