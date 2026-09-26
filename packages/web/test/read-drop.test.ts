import { describe, expect, it } from "vitest";
import { emptyTree, type InputTree } from "../src/input/project-files.js";
import {
  MAX_DEPTH,
  SKIP_DIRS,
  readDataTransfer,
  walkEntry,
  wanted,
} from "../src/input/read-drop.js";

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
  it("reads TMDL, the config, the project files, and report JSON under a .Report's definition, and nothing else", () => {
    for (const p of [
      "Sales.tmdl",
      "a/b/pbiplint.config.json",
      "X.Report/definition.pbir",
      "X.Report/.platform",
      "Demo.pbip",
      "X.Report/definition/report.json",
      "P/X.Report/definition/pages/p/visuals/v/visual.json",
      "X.Report/definition/pages/p/visuals/v/mobile.json",
    ])
      expect(wanted(p), p).toBe(true);
    for (const p of [
      "X.Report/report.json",
      "X.Report/StaticResources/x.json",
      "X.Report/StaticResources/definition/x.json",
      "X.SemanticModel/definition/x.json",
      "notes.json",
      "X.Report/definition/x.png",
      "cache.abf",
    ])
      expect(wanted(p), p).toBe(false);
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
    const seen = emptyTree();
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
    const seen = emptyTree();
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
    const seen = emptyTree();
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
    await walkEntry(nest(0), emptyTree());
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
    const tree = emptyTree();
    await walkEntry(wrapped, tree);
    // Every level of the fake has the same fullPath, so the folder the cap names is "Loop".
    expect(tree).toEqual({
      ...emptyTree(),
      diagnostics: [
        {
          kind: "depth-cap",
          path: "Loop",
          message: `the walk stopped ${MAX_DEPTH} folders deep at Loop, so files below it were not read`,
        },
      ],
    });
    // One reader per level, and the level that hits the cap opens none: the walk went exactly as
    // deep as the cap allows and no deeper.
    expect(state.readers).toBe(MAX_DEPTH);
  });
  it("records a .Report folder, a legacy report.json and model.bim by name without opening them, and a depth-cap diagnostic", async () => {
    const tree: InputTree = {
      entries: [],
      modelFolders: [],
      reportFolders: [],
      markers: [],
      diagnostics: [],
      unreadFolders: [],
    };
    await walkEntry(
      dir("Proj", "/Proj", [
        dir("Old.Report", "/Proj/Old.Report", [
          file("report.json", "/Proj/Old.Report/report.json", "{}"),
        ]),
        dir("Old.SemanticModel", "/Proj/Old.SemanticModel", [
          file("model.bim", "/Proj/Old.SemanticModel/model.bim", "{}"),
        ]),
        dir("New.Report", "/Proj/New.Report", [
          dir("definition", "/Proj/New.Report/definition", [
            file("report.json", "/Proj/New.Report/definition/report.json", "{}"),
          ]),
        ]),
      ]),
      tree,
    );
    expect(tree.reportFolders).toEqual(["Proj/Old.Report", "Proj/New.Report"]);
    expect(tree.markers).toEqual([
      { path: "Proj/Old.Report/report.json", kind: "legacy-report" },
      { path: "Proj/Old.SemanticModel/model.bim", kind: "legacy-model" },
    ]);
    expect(tree.entries.map((e) => e.path)).toEqual(["Proj/New.Report/definition/report.json"]);
    expect(tree.diagnostics).toEqual([]);
    // A chain deeper than the cap stops with a diagnostic naming the folder it stopped in.
    let deep = dir("bottom", "/bottom", [file("x.tmdl", "/bottom/x.tmdl", "table X\n")]);
    for (let i = MAX_DEPTH; i >= 0; i--) deep = dir(`d${i}`, `/d${i}`, [deep]);
    const capped: InputTree = {
      entries: [],
      modelFolders: [],
      reportFolders: [],
      markers: [],
      diagnostics: [],
      unreadFolders: [],
    };
    await walkEntry(deep, capped);
    expect(capped.entries).toEqual([]);
    expect(capped.diagnostics).toEqual([
      {
        kind: "depth-cap",
        path: `d${MAX_DEPTH}`,
        message: `the walk stopped ${MAX_DEPTH} folders deep at d${MAX_DEPTH}, so files below it were not read`,
      },
    ]);
  });
  it("records a file that could not be read as a diagnostic and goes on", async () => {
    const bad = {
      ...file("Sales.tmdl", "/M/Sales.tmdl", ""),
      file: (_ok: unknown, fail: (e: Error) => void) => fail(new Error("locked")),
    } as unknown as FileSystemFileEntry;
    const tree: InputTree = {
      entries: [],
      modelFolders: [],
      reportFolders: [],
      markers: [],
      diagnostics: [],
      unreadFolders: [],
    };
    await walkEntry(dir("M", "/M", [bad, file("Date.tmdl", "/M/Date.tmdl", "table Date\n")]), tree);
    expect(tree.entries.map((e) => e.path)).toEqual(["M/Date.tmdl"]);
    expect(tree.diagnostics).toEqual([
      {
        kind: "unread-file",
        path: "M/Sales.tmdl",
        message: "M/Sales.tmdl could not be read (locked), so it was not linted",
      },
    ]);
  });
  it("names a file whose text will not come, and keeps the first refusal it met", async () => {
    // entry.file() hands over a File and the read fails after: the second of the drop route's two
    // reads. The refusal is the first path the walk could not read, and a later one never
    // replaces it.
    const locked = {
      ...file("A.tmdl", "/M/A.tmdl", ""),
      file: (_ok: unknown, fail: (e: Error) => void) => fail(new Error("locked")),
    } as unknown as FileSystemFileEntry;
    const unreadable = {
      ...file("B.tmdl", "/M/B.tmdl", ""),
      file: (ok: (f: File) => void) =>
        ok(
          Object.assign(new File([""], "B.tmdl"), {
            text: () =>
              Promise.reject(new DOMException("The file could not be read", "NotReadableError")),
          }),
        ),
    } as unknown as FileSystemFileEntry;
    const tree = emptyTree();
    await walkEntry(
      dir("M", "/M", [locked, unreadable, file("C.tmdl", "/M/C.tmdl", "table C\n")]),
      tree,
    );
    expect(tree.entries.map((e) => e.path)).toEqual(["M/C.tmdl"]);
    expect(tree.diagnostics).toEqual([
      {
        kind: "unread-file",
        path: "M/A.tmdl",
        message: "M/A.tmdl could not be read (locked), so it was not linted",
      },
      {
        kind: "unread-file",
        path: "M/B.tmdl",
        message: "M/B.tmdl could not be read (The file could not be read), so it was not linted",
      },
    ]);
    expect(tree.refusal).toEqual({ path: "M/A.tmdl", reason: "locked" });
    // A file is not a folder.
    expect(tree.unreadFolders).toEqual([]);
    // A tree that read everything has no refusal at all.
    const clean = emptyTree();
    await walkEntry(dir("M", "/M", [file("C.tmdl", "/M/C.tmdl", "table C\n")]), clean);
    expect(clean).not.toHaveProperty("refusal");
  });
  it("names a folder it cannot list once, keeps the batches it had, and goes on with its siblings", async () => {
    // Chrome hands out a folder's entries in batches; a later batch can fail after an earlier one
    // was walked, and what that earlier batch held is still read.
    let listed = 0;
    const failing = {
      ...dir("M", "/P/M", []),
      createReader: () => ({
        readEntries: (ok: (entries: FileSystemEntry[]) => void, fail: (e: Error) => void) => {
          listed += 1;
          if (listed === 1) ok([file("A.tmdl", "/P/M/A.tmdl", "table A\n")]);
          else
            fail(
              new DOMException("A requested file or directory could not be found", "NotFoundError"),
            );
        },
      }),
    } as unknown as FileSystemDirectoryEntry;
    const tree = emptyTree();
    await walkEntry(
      dir("P", "/P", [failing, dir("N", "/P/N", [file("B.tmdl", "/P/N/B.tmdl", "table B\n")])]),
      tree,
    );
    expect(tree.entries.map((e) => e.path)).toEqual(["P/M/A.tmdl", "P/N/B.tmdl"]);
    expect(tree.diagnostics).toEqual([
      {
        kind: "unread-file",
        path: "P/M",
        message:
          "P/M could not be read (A requested file or directory could not be found), so it was not linted",
      },
    ]);
    expect(tree.refusal).toEqual({
      path: "P/M",
      reason: "A requested file or directory could not be found",
    });
    // The notice does not say its path is a folder, and lint takes a folder with a trailing /, so
    // the tree says so.
    expect(tree.unreadFolders).toEqual(["P/M"]);
    // The walk asked for the second batch once and stopped there, rather than asking again.
    expect(listed).toBe(2);
  });
  it("never walks a report's StaticResources or CustomVisuals, and says nothing about them at the cap", async () => {
    expect(SKIP_DIRS.has("StaticResources")).toBe(true);
    expect(SKIP_DIRS.has("CustomVisuals")).toBe(true);
    let opened = 0;
    const counted = (entry: FileSystemDirectoryEntry): FileSystemDirectoryEntry =>
      ({
        ...entry,
        createReader: () => {
          opened += 1;
          return entry.createReader();
        },
      }) as unknown as FileSystemDirectoryEntry;
    const tree = emptyTree();
    await walkEntry(
      dir("X.Report", "/X.Report", [
        counted(
          dir("StaticResources", "/X.Report/StaticResources", [
            dir("definition", "/X.Report/StaticResources/definition", [
              file("x.json", "/X.Report/StaticResources/definition/x.json", "{}"),
            ]),
          ]),
        ),
        counted(
          dir("CustomVisuals", "/X.Report/CustomVisuals", [
            file("pbiviz.json", "/X.Report/CustomVisuals/pbiviz.json", "{}"),
          ]),
        ),
        dir("definition", "/X.Report/definition", [
          file("report.json", "/X.Report/definition/report.json", "{}"),
        ]),
      ]),
      tree,
    );
    expect(opened).toBe(0);
    expect(tree.entries.map((e) => e.path)).toEqual(["X.Report/definition/report.json"]);
    // A skipped folder that sits at the cap is still only skipped: the skip is tested first, so a
    // folder that is never read raises no notice about not being read.
    let deep: FileSystemEntry = dir("StaticResources", "/StaticResources", []);
    for (let i = MAX_DEPTH - 1; i >= 0; i--) deep = dir(`d${i}`, `/d${i}`, [deep]);
    const capped = emptyTree();
    await walkEntry(deep, capped);
    expect(capped.diagnostics).toEqual([]);
  });
});

describe("readDataTransfer", () => {
  it("uses the entries API when the browser has it", async () => {
    const entry = file("T.tmdl", "/T.tmdl", "table T\n");
    const dt = { items: [{ webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual({
      ...emptyTree(),
      entries: [{ path: "T.tmdl", text: "table T\n" }],
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
      ...emptyTree(),
      entries: [{ path: "T.tmdl", text: "table T\n" }],
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
      ...emptyTree(),
      entries: [{ path: "T.tmdl", text: "table T\n" }],
    });
  });
  it("names a dropped file whose read fails, once, on both top-level branches", async () => {
    // Two files of the same name can be dropped side by side (from a search window, say), and a
    // path is named once however many times it fails.
    const failing = (name: string, reason: string): File =>
      Object.assign(new File([""], name), { text: () => Promise.reject(new Error(reason)) });
    const entry = file("T.tmdl", "/T.tmdl", "");
    const viaItems = {
      items: [
        { webkitGetAsEntry: () => entry, getAsFile: () => failing("T.tmdl", "gone") },
        { webkitGetAsEntry: () => entry, getAsFile: () => failing("T.tmdl", "gone again") },
        {
          webkitGetAsEntry: () => file("U.tmdl", "/U.tmdl", ""),
          getAsFile: () => new File(["table U\n"], "U.tmdl"),
        },
      ],
      files: [],
    } as unknown as DataTransfer;
    const unreadT = {
      kind: "unread-file",
      path: "T.tmdl",
      message: "T.tmdl could not be read (gone), so it was not linted",
    };
    expect(await readDataTransfer(viaItems)).toEqual({
      ...emptyTree(),
      entries: [{ path: "U.tmdl", text: "table U\n" }],
      diagnostics: [unreadT],
      refusal: { path: "T.tmdl", reason: "gone" },
    });
    const flat = {
      items: [],
      files: [failing("T.tmdl", "gone"), new File(["table U\n"], "U.tmdl")],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(flat)).toEqual({
      ...emptyTree(),
      entries: [{ path: "U.tmdl", text: "table U\n" }],
      diagnostics: [unreadT],
      refusal: { path: "T.tmdl", reason: "gone" },
    });
  });
  it("falls back to flat files when it does not", async () => {
    const dt = {
      items: [],
      files: [new File(["table T\n"], "T.tmdl"), new File(["{}"], "report.json")],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual({
      ...emptyTree(),
      entries: [{ path: "T.tmdl", text: "table T\n" }],
    });
  });
});
