import { pbixRefusal } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { emptyTree, selectProject } from "../src/input/project-files.js";
import { readDirectoryInput, readPickedDirectory } from "../src/input/pick-folder.js";
import { MAX_DEPTH } from "../src/input/read-drop.js";

type Handle =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | { kind: "directory"; name: string; values(): AsyncIterable<Handle> };

const fileHandle = (name: string, text: string): Handle => ({
  kind: "file",
  name,
  getFile: async () => new File([text], name),
});
const dirHandle = (name: string, children: Handle[]): Handle => ({
  kind: "directory",
  name,
  async *values() {
    yield* children;
  },
});

/** A file the walk must never open: reading it fails, and the test can see it was tried. */
const neverOpened = (name: string, opened: string[]): Handle => ({
  kind: "file",
  name,
  getFile: async () => {
    opened.push(name);
    throw new Error("opened");
  },
});
/** A folder the walk must never list: listing it is recorded, and it holds nothing. */
const neverListed = (name: string, listed: string[]): Handle => ({
  kind: "directory",
  name,
  values: () => {
    listed.push(name);
    return (async function* () {})();
  },
});
/** A folder whose listing fails after handing out `before`: at the start when `before` is empty. */
const failingDir = (name: string, before: Handle[], error: unknown): Handle => ({
  kind: "directory",
  name,
  async *values() {
    yield* before;
    throw error;
  },
});
/** A chain of folders d0 to d<last>, the innermost holding `inner`. */
const chain = (last: number, inner: Handle[]): Handle => {
  let deep = dirHandle(`d${last}`, inner);
  for (let i = last - 1; i >= 0; i--) deep = dirHandle(`d${i}`, [deep]);
  return deep;
};
const capAt = (folder: string) => ({
  kind: "depth-cap",
  path: folder,
  message: `the walk stopped ${MAX_DEPTH} folders deep at ${folder}, so files below it were not read`,
});

/**
 * Counts the folders a walk opens for iteration, and throws once it has opened more than `limit`.
 * The throw is what makes a missing depth cap a fast red: a cycle walked with no cap exhausts the
 * worker's memory and dies with SIGABRT before any assertion at the end of a test could run.
 */
function openCount(limit: number) {
  const state = { opened: 0 };
  const wrap = (handle: Handle): Handle =>
    handle.kind === "file"
      ? handle
      : {
          ...handle,
          values: () => {
            state.opened += 1;
            if (state.opened > limit) throw new Error(`the walk opened more than ${limit} folders`);
            return handle.values();
          },
        };
  return { state, wrap };
}

describe("readPickedDirectory", () => {
  it("walks the picked directory, prefixing its name, and reads only model files", async () => {
    const picked = dirHandle("Demo.SemanticModel", [
      fileHandle("definition.pbism", "{}"),
      dirHandle("definition", [fileHandle("model.tmdl", "model Model\n")]),
      dirHandle(".git", [fileHandle("x.tmdl", "never")]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out).toEqual({
      ...emptyTree(),
      entries: [{ path: "Demo.SemanticModel/definition/model.tmdl", text: "model Model\n" }],
      modelFolders: ["Demo.SemanticModel"],
    });
  });
  it("records the .SemanticModel folders inside a picked PBIP folder", async () => {
    const picked = dirHandle("Proj", [
      dirHandle("Old.SemanticModel", [fileHandle("model.bim", "{}")]),
      dirHandle("New.SemanticModel", [
        dirHandle("definition", [fileHandle("model.tmdl", "model Model\n")]),
      ]),
      dirHandle("node_modules", [dirHandle("X.SemanticModel", [])]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out?.modelFolders).toEqual(["Proj/Old.SemanticModel", "Proj/New.SemanticModel"]);
    expect(out?.entries.map((e) => e.path)).toEqual([
      "Proj/New.SemanticModel/definition/model.tmdl",
    ]);
  });
  it("tells the caller once the folder is chosen, before any file is read", async () => {
    const seen: string[] = [];
    const picked = dirHandle("Demo.SemanticModel", [
      {
        kind: "file",
        name: "model.tmdl",
        getFile: async () => {
          seen.push("read");
          return new File(["model Model\n"], "model.tmdl");
        },
      },
    ]);
    await readPickedDirectory(
      async () => picked as never,
      () => seen.push("picked"),
    );
    expect(seen).toEqual(["picked", "read"]);
    const abort = async () => {
      throw new DOMException("cancelled", "AbortError");
    };
    const calls: string[] = [];
    await readPickedDirectory(abort as never, () => calls.push("picked"));
    expect(calls).toEqual([]);
  });
  it("reads nothing when the picked folder is itself one of the skipped folders", async () => {
    const picked = dirHandle("node_modules", [
      dirHandle("pkg", [fileHandle("model.tmdl", "model Model\n")]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out).toEqual(emptyTree());
  });
  it("stops at the depth cap instead of looping when a picked folder contains itself", async () => {
    // The open count is what proves the walk stopped because of the cap: an empty tree on its own
    // is also what a walk that gave up for some other reason leaves behind. One open per level,
    // and the level that hits the cap opens nothing, so the walk goes exactly as deep as the cap
    // allows. MAX_DEPTH is shared with the drop route, which is walked the same way.
    const { state, wrap } = openCount(MAX_DEPTH + 1);
    const loop: Handle = {
      kind: "directory",
      name: "Loop",
      async *values() {
        yield wrapped;
      },
    };
    const wrapped = wrap(loop);
    const out = await readPickedDirectory(async () => wrapped as never);
    // The picker's paths grow with the walk, so the folder the cap names is Loop repeated once per
    // level, the picked root included.
    expect(out).toEqual({
      ...emptyTree(),
      diagnostics: [
        capAt(
          Array<string>(MAX_DEPTH + 1)
            .fill("Loop")
            .join("/"),
        ),
      ],
    });
    expect(state.opened).toBe(MAX_DEPTH);
  });
  it("records a .Report folder, a legacy report.json and model.bim by name without opening them", async () => {
    const opened: string[] = [];
    const picked = dirHandle("Proj", [
      dirHandle("Old.Report", [neverOpened("report.json", opened)]),
      dirHandle("Old.SemanticModel", [neverOpened("model.bim", opened)]),
      dirHandle("New.Report", [
        fileHandle("definition.pbir", "{}"),
        dirHandle("definition", [
          fileHandle("report.json", "{}"),
          dirHandle("pages", [dirHandle("p", [fileHandle("page.json", "{}")])]),
        ]),
        neverListed("StaticResources", opened),
        neverListed("CustomVisuals", opened),
      ]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    // Neither marker was opened, and neither of the report's skipped folders was listed.
    expect(opened).toEqual([]);
    expect(out?.reportFolders).toEqual(["Proj/Old.Report", "Proj/New.Report"]);
    expect(out?.modelFolders).toEqual(["Proj/Old.SemanticModel"]);
    expect(out?.markers).toEqual([
      { path: "Proj/Old.Report/report.json", kind: "legacy-report" },
      { path: "Proj/Old.SemanticModel/model.bim", kind: "legacy-model" },
    ]);
    expect(out?.entries.map((e) => e.path)).toEqual([
      "Proj/New.Report/definition.pbir",
      "Proj/New.Report/definition/report.json",
      "Proj/New.Report/definition/pages/p/page.json",
    ]);
    expect(out?.diagnostics).toEqual([]);
  });
  it("records a .pbix by name, in any case, without opening it, and none in a folder it skips", async () => {
    const opened: string[] = [];
    const picked = dirHandle("Demo", [
      neverOpened("Sales.pbix", opened),
      dirHandle("Archive", [neverOpened("Old.PBIX", opened)]),
      dirHandle(".pbi", [neverOpened("x.pbix", opened)]),
      dirHandle("StaticResources", [neverOpened("y.pbix", opened)]),
      // A folder is not a file, whatever its name.
      dirHandle("Folder.pbix", []),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(opened).toEqual([]);
    expect(out).toEqual({
      ...emptyTree(),
      markers: [
        { path: "Demo/Sales.pbix", kind: "pbix" },
        { path: "Demo/Archive/Old.PBIX", kind: "pbix" },
      ],
    });
    // Nothing else in the folder, so the page names the first the CLI's walk would meet.
    expect(() => selectProject(out!)).toThrow(pbixRefusal("Demo/Archive/Old.PBIX", 1));
  });
  it("stops a chain past the cap with a diagnostic naming the folder it stopped in", async () => {
    const out = await readPickedDirectory(
      async () =>
        chain(MAX_DEPTH, [dirHandle("bottom", [fileHandle("x.tmdl", "table X\n")])]) as never,
    );
    const stopped = Array.from({ length: MAX_DEPTH + 1 }, (_, i) => `d${i}`).join("/");
    expect(out?.entries).toEqual([]);
    expect(out?.diagnostics).toEqual([capAt(stopped)]);
    // A skipped folder at the cap is only skipped: nothing is said about a folder never read.
    const skipped = await readPickedDirectory(
      async () => chain(MAX_DEPTH - 1, [dirHandle("StaticResources", [])]) as never,
    );
    expect(skipped?.diagnostics).toEqual([]);
  });
  it("records a file that could not be read as a diagnostic, keeps the first refusal, and goes on", async () => {
    const picked = dirHandle("M", [
      {
        kind: "file",
        name: "Sales.tmdl",
        getFile: () => Promise.reject(new DOMException("The file is locked", "NotReadableError")),
      },
      {
        kind: "file",
        name: "Budget.tmdl",
        getFile: async () =>
          Object.assign(new File([""], "Budget.tmdl"), {
            text: () => Promise.reject(new Error("aborted")),
          }),
      },
      fileHandle("Date.tmdl", "table Date\n"),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out?.entries.map((e) => e.path)).toEqual(["M/Date.tmdl"]);
    expect(out?.diagnostics).toEqual([
      {
        kind: "unread-file",
        path: "M/Sales.tmdl",
        message: "M/Sales.tmdl could not be read (The file is locked), so it was not linted",
      },
      {
        kind: "unread-file",
        path: "M/Budget.tmdl",
        message: "M/Budget.tmdl could not be read (aborted), so it was not linted",
      },
    ]);
    expect(out?.refusal).toEqual({ path: "M/Sales.tmdl", reason: "The file is locked" });
    expect(out?.unreadFolders).toEqual([]);
  });
  it("names a folder whose listing fails, at the start or partway, once, and goes on with its siblings", async () => {
    const picked = dirHandle("P", [
      failingDir(
        "A",
        [],
        new DOMException("A requested file or directory could not be found", "NotFoundError"),
      ),
      failingDir("B", [fileHandle("x.tmdl", "table X\n")], "permission revoked"),
      dirHandle("C", [fileHandle("y.tmdl", "table Y\n")]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out?.entries.map((e) => e.path)).toEqual(["P/B/x.tmdl", "P/C/y.tmdl"]);
    expect(out?.diagnostics).toEqual([
      {
        kind: "unread-file",
        path: "P/A",
        message:
          "P/A could not be read (A requested file or directory could not be found), so it was not linted",
      },
      {
        kind: "unread-file",
        path: "P/B",
        message: "P/B could not be read (permission revoked), so it was not linted",
      },
    ]);
    expect(out?.refusal).toEqual({
      path: "P/A",
      reason: "A requested file or directory could not be found",
    });
    // The notices do not say their paths are folders, and lint takes a folder with a trailing /,
    // so the tree says so.
    expect(out?.unreadFolders).toEqual(["P/A", "P/B"]);
  });
  it("returns null when the person cancels the dialog", async () => {
    const abort = async () => {
      throw new DOMException("cancelled", "AbortError");
    };
    expect(await readPickedDirectory(abort as never)).toBeNull();
  });
  it("passes on a failure that is not a cancel, with nothing said about a read starting", async () => {
    // A cancel is the one refusal that means "nothing happened". Everything else is worth showing,
    // and onPicked must stay unrun either way: the page starts its run from that call.
    const calls: string[] = [];
    const denied = async () => {
      throw new DOMException("permission denied", "NotAllowedError");
    };
    await expect(readPickedDirectory(denied as never, () => calls.push("picked"))).rejects.toThrow(
      "permission denied",
    );
    const broken = async () => {
      throw new TypeError("showDirectoryPicker is not a function");
    };
    await expect(readPickedDirectory(broken as never, () => calls.push("picked"))).rejects.toThrow(
      TypeError,
    );
    expect(calls).toEqual([]);
  });
});

describe("readDirectoryInput", () => {
  it("uses the relative path the browser reports for each file", async () => {
    const f = Object.assign(new File(["table T\n"], "T.tmdl"), {
      webkitRelativePath: "Demo.SemanticModel/definition/tables/T.tmdl",
    });
    const junk = Object.assign(new File(["{}"], "report.json"), {
      webkitRelativePath: "Demo.Report/report.json",
    });
    const input = { files: [f, junk] } as unknown as HTMLInputElement;
    expect(await readDirectoryInput(input)).toEqual({
      ...emptyTree(),
      entries: [{ path: "Demo.SemanticModel/definition/tables/T.tmdl", text: "table T\n" }],
      modelFolders: ["Demo.SemanticModel"],
      reportFolders: ["Demo.Report"],
      markers: [{ path: "Demo.Report/report.json", kind: "legacy-report" }],
    });
  });
  it("sees a .SemanticModel folder in the reported paths without reading the files in it", async () => {
    const bim = Object.assign(new File(["{}"], "model.bim"), {
      webkitRelativePath: "Proj/Old.SemanticModel/model.bim",
      text: () => Promise.reject(new Error("opened")),
    });
    const tmdl = Object.assign(new File(["model Model\n"], "model.tmdl"), {
      webkitRelativePath: "Proj/New.SemanticModel/definition/model.tmdl",
    });
    const junk = Object.assign(new File(["{}"], "model.bim"), {
      webkitRelativePath: "Proj/.git/X.SemanticModel/model.bim",
    });
    const input = { files: [bim, tmdl, junk] } as unknown as HTMLInputElement;
    expect((await readDirectoryInput(input)).modelFolders).toEqual([
      "Proj/Old.SemanticModel",
      "Proj/New.SemanticModel",
    ]);
  });
  it("skips junk folders anywhere in the reported path", async () => {
    const tmdl = (path: string, text: string) =>
      Object.assign(new File([text], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
      });
    const input = {
      files: [
        tmdl("Demo.SemanticModel/definition/model.tmdl", "model Model\n"),
        tmdl(
          "Demo.SemanticModel/node_modules/pkg/fixtures/X.SemanticModel/definition/model.tmdl",
          "never",
        ),
        tmdl("Demo.SemanticModel/.git/x.tmdl", "never"),
      ],
    } as unknown as HTMLInputElement;
    expect((await readDirectoryInput(input)).entries).toEqual([
      { path: "Demo.SemanticModel/definition/model.tmdl", text: "model Model\n" },
    ]);
  });
  it("reads a report's definition JSON, records its folder and the legacy markers, and opens neither marker", async () => {
    const at = (path: string, text: string) =>
      Object.assign(new File([text], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
      });
    const unopened = (path: string) =>
      Object.assign(at(path, "{}"), { text: () => Promise.reject(new Error("opened")) });
    const input = {
      files: [
        unopened("Proj/Old.Report/report.json"),
        unopened("Proj/Old.SemanticModel/model.bim"),
        at("Proj/New.Report/definition.pbir", "{}"),
        at("Proj/New.Report/.platform", "{}"),
        at("Proj/New.Report/definition/report.json", "{}"),
        at("Proj/New.Report/definition/pages/p/visuals/v/visual.json", "{}"),
        at("Proj/New.Report/definition/pages/p/visuals/v/mobile.json", "{}"),
        // Names wanted anywhere, so only the skip keeps these unopened.
        unopened("Proj/New.Report/StaticResources/SharedResources/x.tmdl"),
        unopened("Proj/New.Report/CustomVisuals/v/.platform"),
        at("Proj/Demo.pbip", "{}"),
      ],
    } as unknown as HTMLInputElement;
    expect(await readDirectoryInput(input)).toEqual({
      ...emptyTree(),
      entries: [
        { path: "Proj/New.Report/definition.pbir", text: "{}" },
        { path: "Proj/New.Report/.platform", text: "{}" },
        { path: "Proj/New.Report/definition/report.json", text: "{}" },
        { path: "Proj/New.Report/definition/pages/p/visuals/v/visual.json", text: "{}" },
        { path: "Proj/New.Report/definition/pages/p/visuals/v/mobile.json", text: "{}" },
        { path: "Proj/Demo.pbip", text: "{}" },
      ],
      modelFolders: ["Proj/Old.SemanticModel"],
      reportFolders: ["Proj/Old.Report", "Proj/New.Report"],
      markers: [
        { path: "Proj/Old.Report/report.json", kind: "legacy-report" },
        { path: "Proj/Old.SemanticModel/model.bim", kind: "legacy-model" },
      ],
    });
  });
  it("records a .pbix by name, in any case, without opening it, and none in a folder it skips", async () => {
    const unopened = (path: string) =>
      Object.assign(new File([""], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
        text: () => Promise.reject(new Error("opened")),
      });
    const input = {
      files: [
        unopened("Demo/Sales.pbix"),
        unopened("Demo/Archive/Old.PBIX"),
        unopened("Demo/.git/x.pbix"),
        unopened("Demo/CustomVisuals/y.pbix"),
      ],
    } as unknown as HTMLInputElement;
    const out = await readDirectoryInput(input);
    expect(out).toEqual({
      ...emptyTree(),
      markers: [
        { path: "Demo/Sales.pbix", kind: "pbix" },
        { path: "Demo/Archive/Old.PBIX", kind: "pbix" },
      ],
    });
    expect(() => selectProject(out)).toThrow(pbixRefusal("Demo/Archive/Old.PBIX", 1));
  });
  it("skips a file past the depth cap with one diagnostic per capped folder, naming the folder at the cap", async () => {
    const at = (path: string, text: string) =>
      Object.assign(new File([text], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
      });
    const folders = (n: number): string => Array.from({ length: n }, (_, i) => `d${i}`).join("/");
    const input = {
      files: [
        // In d<MAX_DEPTH - 1>, which the walkers list: read.
        at(`${folders(MAX_DEPTH)}/z.tmdl`, "table Z\n"),
        // In d<MAX_DEPTH>, where the walkers stop, and below it: one notice for the two.
        at(`${folders(MAX_DEPTH + 1)}/x.tmdl`, "table X\n"),
        at(`${folders(MAX_DEPTH + 1)}/deeper/y.tmdl`, "table Y\n"),
        // Past the cap but in a folder never read, which says nothing.
        at(`${folders(MAX_DEPTH)}/StaticResources/a/b.json`, "{}"),
      ],
    } as unknown as HTMLInputElement;
    const out = await readDirectoryInput(input);
    expect(out.entries.map((e) => e.path)).toEqual([`${folders(MAX_DEPTH)}/z.tmdl`]);
    expect(out.diagnostics).toEqual([capAt(folders(MAX_DEPTH + 1))]);
  });
  it("records a file that could not be read as a diagnostic, keeps the first refusal, and goes on", async () => {
    const at = (path: string, text: string) =>
      Object.assign(new File([text], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
      });
    const failing = (path: string, reason: string) =>
      Object.assign(at(path, ""), { text: () => Promise.reject(new Error(reason)) });
    const input = {
      files: [
        failing("M/Sales.tmdl", "locked"),
        failing("M/Budget.tmdl", "gone"),
        at("M/Date.tmdl", "table Date\n"),
      ],
    } as unknown as HTMLInputElement;
    const out = await readDirectoryInput(input);
    expect(out.entries).toEqual([{ path: "M/Date.tmdl", text: "table Date\n" }]);
    expect(out.diagnostics).toEqual([
      {
        kind: "unread-file",
        path: "M/Sales.tmdl",
        message: "M/Sales.tmdl could not be read (locked), so it was not linted",
      },
      {
        kind: "unread-file",
        path: "M/Budget.tmdl",
        message: "M/Budget.tmdl could not be read (gone), so it was not linted",
      },
    ]);
    expect(out.refusal).toEqual({ path: "M/Sales.tmdl", reason: "locked" });
    // This route lists no folder, so it never has one it could not list.
    expect(out.unreadFolders).toEqual([]);
  });
});
