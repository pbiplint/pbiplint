import { describe, expect, it } from "vitest";
import { readDataTransfer, walkEntry, wanted } from "../src/input/read-drop.js";

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
    const out: { path: string; text: string }[] = [];
    await walkEntry(tree, out);
    expect(out.map((e) => e.path).sort()).toEqual([
      "Demo.SemanticModel/definition/model.tmdl",
      "Demo.SemanticModel/definition/tables/A.tmdl",
      "Demo.SemanticModel/definition/tables/B.tmdl",
      "Demo.SemanticModel/definition/tables/C.tmdl",
      "Demo.SemanticModel/pbiplint.config.json",
    ]);
    expect(out.find((e) => e.path.endsWith("A.tmdl"))?.text).toBe("table A\n");
  });
});

describe("readDataTransfer", () => {
  it("uses the entries API when the browser has it", async () => {
    const entry = file("T.tmdl", "/T.tmdl", "table T\n");
    const dt = { items: [{ webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("falls back to flat files when it does not", async () => {
    const dt = {
      items: [],
      files: [new File(["table T\n"], "T.tmdl"), new File(["{}"], "report.json")],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
});
