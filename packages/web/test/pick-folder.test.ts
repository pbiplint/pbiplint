import { describe, expect, it } from "vitest";
import { readDirectoryInput, readPickedDirectory } from "../src/input/pick-folder.js";

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

describe("readPickedDirectory", () => {
  it("walks the picked directory, prefixing its name, and reads only model files", async () => {
    const picked = dirHandle("Demo.SemanticModel", [
      fileHandle("definition.pbism", "{}"),
      dirHandle("definition", [fileHandle("model.tmdl", "model Model\n")]),
      dirHandle(".git", [fileHandle("x.tmdl", "never")]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out).toEqual({
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
  it("returns null when the person cancels the dialog", async () => {
    const abort = async () => {
      throw new DOMException("cancelled", "AbortError");
    };
    expect(await readPickedDirectory(abort as never)).toBeNull();
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
      entries: [{ path: "Demo.SemanticModel/definition/tables/T.tmdl", text: "table T\n" }],
      modelFolders: ["Demo.SemanticModel"],
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
});
