import type { InputEntry } from "./model-files.js";
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

/** Walks a picked folder. Null when the person closes the dialog without choosing. */
export async function readPickedDirectory(pick: DirectoryPicker): Promise<InputEntry[] | null> {
  let dir: DirectoryHandleLike;
  try {
    dir = await pick({ mode: "read" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
  const out: InputEntry[] = [];
  await walkHandle(dir, dir.name, out);
  return out;
}

async function walkHandle(
  dir: DirectoryHandleLike,
  prefix: string,
  out: InputEntry[],
): Promise<void> {
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      if (wanted(handle.name))
        out.push({ path: `${prefix}/${handle.name}`, text: await (await handle.getFile()).text() });
    } else if (!SKIP_DIRS.has(handle.name)) {
      await walkHandle(handle, `${prefix}/${handle.name}`, out);
    }
  }
}

/**
 * This route sees paths rather than entries: a directory input enumerates hidden and nested
 * folders too, so the skip is applied to the segments of the reported path.
 */
const skipped = (path: string): boolean => path.split("/").some((seg) => SKIP_DIRS.has(seg));

/** Firefox and Safari: the files of an <input type="file" webkitdirectory>, with the paths the browser reports. */
export async function readDirectoryInput(input: HTMLInputElement): Promise<InputEntry[]> {
  const out: InputEntry[] = [];
  for (const file of [...(input.files ?? [])])
    if (wanted(file.name) && !skipped(file.webkitRelativePath))
      out.push({ path: file.webkitRelativePath || file.name, text: await file.text() });
  return out;
}
