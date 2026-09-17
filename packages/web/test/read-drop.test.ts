import { describe, expect, it } from "vitest";
import type { InputTree } from "../src/input/model-files.js";
import { MAX_DEPTH, readDataTransfer, walkEntry, wanted } from "../src/input/read-drop.js";

/** A fake FileSystemEntry tree: a directory reader hands out its children in batches of two, then an empty batch. */
function dir(
  name: string,
  fullPath: string,
  children: FileSystemEntry[],
): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (ok: (entries: FileSystemEntry[]) => void) => {
          ok(children.slice(i, i + 2));
          i += 2;
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}
function file(name: string, fullPath: string, text: string): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (ok: (f: File) => void) => ok(new File([text], name)),
  } as unknown as FileSystemFileEntry;
}

/**
 * Counts the directory readers a walk opens, and throws once it has opened more than `limit` of
 * them. The throw is what makes a missing depth cap a fast red: a cycle walked with no cap
 * exhausts the worker's memory and dies with SIGABRT long before an assertion at the end of a
 * test could run, which reads as an unexplained crash rather than a failure.
 */
function readerCount(limit: number) {
  const state = { readers: 0 };
  const wrap = (entry: FileSystemDirectoryEntry): FileSystemDirectoryEntry =>
    ({
      ...entry,
      createReader: () => {
        state.readers += 1;
        if (state.readers > limit)
          throw new Error(`the walk opened more than ${limit} directory readers`);
        return entry.createReader();
      },
    }) as unknown as FileSystemDirectoryEntry;
  return { state, wrap };
}

describe("wanted", () => {
  it("reads only TMDL files and the config", () => {
    expect(wanted("Sales.tmdl")).toBe(true);
    expect(wanted("pbiplint.config.json")).toBe(true);
    expect(wanted("report.json")).toBe(false);
    expect(wanted("cache.abf")).toBe(false);
  });
});

describe("walkEntry", () => {
  it("walks nested folders in batches, strips the leading slash, skips junk folders and other files", async () => {
    const tree = dir("Demo.SemanticModel", "/Demo.SemanticModel", [
      file("definition.pbism", "/Demo.SemanticModel/definition.pbism", "{}"),
      dir("definition", "/Demo.SemanticModel/definition", [
        file("model.tmdl", "/Demo.SemanticModel/definition/model.tmdl", "model Model\n"),
        dir("tables", "/Demo.SemanticModel/definition/tables", [
          file("A.tmdl", "/Demo.SemanticModel/definition/tables/A.tmdl", "table A\n"),
          file("B.tmdl", "/Demo.SemanticModel/definition/tables/B.tmdl", "table B\n"),
          file("C.tmdl", "/Demo.SemanticModel/definition/tables/C.tmdl", "table C\n"),
        ]),
      ]),
      dir(".pbi", "/Demo.SemanticModel/.pbi", [
        file("x.tmdl", "/Demo.SemanticModel/.pbi/x.tmdl", "never"),
      ]),
      file("pbiplint.config.json", "/Demo.SemanticModel/pbiplint.config.json", "{}"),
    ]);
    const seen: InputTree = { entries: [], modelFolders: [] };
    await walkEntry(tree, seen);
    const out = seen.entries;
    expect(seen.modelFolders).toEqual(["Demo.SemanticModel"]);
    expect(out.map((e) => e.path).sort()).toEqual([
      "Demo.SemanticModel/definition/model.tmdl",
      "Demo.SemanticModel/definition/tables/A.tmdl",
      "Demo.SemanticModel/definition/tables/B.tmdl",
      "Demo.SemanticModel/definition/tables/C.tmdl",
      "Demo.SemanticModel/pbiplint.config.json",
    ]);
    expect(out.find((e) => e.path.endsWith("A.tmdl"))?.text).toBe("table A\n");
  });
  it("records every .SemanticModel folder it passes, opening nothing inside one with no .tmdl", async () => {
    let opened = 0;
    const bim = file("model.bim", "/Proj/Old.SemanticModel/model.bim", "{}");
    (bim as unknown as { file: () => void }).file = () => {
      opened += 1;
    };
    const tree = dir("Proj", "/Proj", [
      dir("Old.SemanticModel", "/Proj/Old.SemanticModel", [bim]),
      dir("New.SemanticModel", "/Proj/New.SemanticModel", [
        dir("definition", "/Proj/New.SemanticModel/definition", [
          file("model.tmdl", "/Proj/New.SemanticModel/definition/model.tmdl", "model Model\n"),
        ]),
      ]),
      dir(".git", "/Proj/.git", [dir("X.SemanticModel", "/Proj/.git/X.SemanticModel", [])]),
    ]);
    const seen: InputTree = { entries: [], modelFolders: [] };
    await walkEntry(tree, seen);
    expect(seen.modelFolders).toEqual(["Proj/Old.SemanticModel", "Proj/New.SemanticModel"]);
    expect(opened).toBe(0);
  });
  it("never opens node_modules, which holds no model and can be enormous", async () => {
    let opened = 0;
    const inside = file("x.tmdl", "/Proj/node_modules/pkg/x.tmdl", "table X\n");
    // Counts the read and still hands the file over, so a walk that does descend fails on the
    // entries it collected rather than hanging on a callback that never comes.
    (inside as unknown as { file: (ok: (f: File) => void) => void }).file = (ok) => {
      opened += 1;
      ok(new File(["table X\n"], "x.tmdl"));
    };
    const tree = dir("Proj", "/Proj", [
      dir("node_modules", "/Proj/node_modules", [dir("pkg", "/Proj/node_modules/pkg", [inside])]),
      file("m.tmdl", "/Proj/m.tmdl", "model Model\n"),
    ]);
    const seen: InputTree = { entries: [], modelFolders: [] };
    await walkEntry(tree, seen);
    expect(seen.entries.map((e) => e.path)).toEqual(["Proj/m.tmdl"]);
    expect(opened).toBe(0);
  });
  it("opens one reader per folder, which is what the depth cap counts", async () => {
    // Anchors the number the cap test asserts: four nested folders, four readers. Without this,
    // a count of MAX_DEPTH there could agree with the cap by coincidence rather than because the
    // walk descends one reader at a time.
    const { state, wrap } = readerCount(MAX_DEPTH);
    const nest = (level: number): FileSystemEntry =>
      wrap(dir(`L${level}`, `/${"L/".repeat(level)}L${level}`, level < 3 ? [nest(level + 1)] : []));
    await walkEntry(nest(0), { entries: [], modelFolders: [] });
    expect(state.readers).toBe(4);
  });
  it("stops at the depth cap instead of looping when a folder contains itself", async () => {
    // A symlink cycle would look like this. No browser hands one out today. The reader count is
    // what proves the walk stopped because of the cap: an empty tree on its own is also what a
    // walk that gave up for some other reason leaves behind.
    const { state, wrap } = readerCount(MAX_DEPTH + 1);
    const loop = {
      isFile: false,
      isDirectory: true,
      name: "Loop",
      fullPath: "/Loop",
      createReader: () => {
        let done = false;
        return {
          readEntries: (ok: (entries: FileSystemEntry[]) => void) => {
            ok(done ? [] : [wrapped]);
            done = true;
          },
        };
      },
    } as unknown as FileSystemDirectoryEntry;
    const wrapped = wrap(loop);
    const tree: InputTree = { entries: [], modelFolders: [] };
    await walkEntry(wrapped, tree);
    expect(tree).toEqual({ entries: [], modelFolders: [] });
    // One reader per level, and the level that hits the cap opens none: the walk went exactly as
    // deep as the cap allows and no deeper.
    expect(state.readers).toBe(MAX_DEPTH);
  });
});

describe("readDataTransfer", () => {
  it("uses the entries API when the browser has it", async () => {
    const entry = file("T.tmdl", "/T.tmdl", "table T\n");
    const dt = { items: [{ webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual({
      entries: [{ path: "T.tmdl", text: "table T\n" }],
      modelFolders: [],
    });
  });
  it("reads a top-level file from the item itself, so an entry whose file() fails still reads", async () => {
    // WebKit hands out a FileSystemFileEntry for a file that exists only in memory, and that
    // entry's file() rejects with NotFoundError; the File on the item is the one to read.
    const broken = {
      isFile: true,
      isDirectory: false,
      name: "T.tmdl",
      fullPath: "/T.tmdl",
      file: (_ok: unknown, fail: (e: Error) => void) => fail(new Error("NotFoundError")),
    } as unknown as FileSystemEntry;
    const dt = {
      items: [
        { webkitGetAsEntry: () => broken, getAsFile: () => new File(["table T\n"], "T.tmdl") },
        { webkitGetAsEntry: () => broken, getAsFile: () => new File(["{}"], "other.json") },
      ],
      files: [],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual({
      entries: [{ path: "T.tmdl", text: "table T\n" }],
      modelFolders: [],
    });
  });
  it("falls back to flat files when an item has no entry to hand out", async () => {
    // Two ways a browser gets here: no webkitGetAsEntry on the item at all, and one that returns
    // null. Neither yields an entry, so the flat file list is the whole drop.
    const dt = {
      items: [
        { getAsFile: () => new File(["table T\n"], "T.tmdl") },
        { webkitGetAsEntry: () => null, getAsFile: () => new File(["{}"], "report.json") },
      ],
      files: [new File(["table T\n"], "T.tmdl"), new File(["{}"], "report.json")],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual({
      entries: [{ path: "T.tmdl", text: "table T\n" }],
      modelFolders: [],
    });
  });
  it("falls back to flat files when it does not", async () => {
    const dt = {
      items: [],
      files: [new File(["table T\n"], "T.tmdl"), new File(["{}"], "report.json")],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual({
      entries: [{ path: "T.tmdl", text: "table T\n" }],
      modelFolders: [],
    });
  });
});
