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
    expect(out).toEqual([
      { path: "Demo.SemanticModel/definition/model.tmdl", text: "model Model\n" },
    ]);
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
    expect(await readDirectoryInput(input)).toEqual([
      { path: "Demo.SemanticModel/definition/tables/T.tmdl", text: "table T\n" },
    ]);
  });
});
