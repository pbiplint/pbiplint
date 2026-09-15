import { describe, expect, it } from "vitest";
import { InputError, selectModel, type InputEntry } from "../src/input/model-files.js";

const e = (path: string, text = `// ${path}\n`): InputEntry => ({ path, text });

describe("selectModel", () => {
  it("takes a dropped .SemanticModel folder and reports paths relative to it", () => {
    const m = selectModel([
      e("Demo.SemanticModel/definition/model.tmdl"),
      e("Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Demo.SemanticModel/definition.pbism"),
    ]);
    expect(m.root).toBe("Demo.SemanticModel");
    expect(m.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
    ]);
    expect(m.config).toBeUndefined();
  });
  it("finds the one semantic model inside a dropped PBIP folder", () => {
    const m = selectModel([
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Proj/Demo.Report/definition/report.json"),
    ]);
    expect(m.root).toBe("Proj/Demo.SemanticModel");
    expect(m.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
    ]);
  });
  it("refuses a folder with two semantic models and names them", () => {
    expect(() =>
      selectModel([
        e("Proj/A.SemanticModel/definition/model.tmdl"),
        e("Proj/B.SemanticModel/definition/model.tmdl"),
      ]),
    ).toThrow(/2 semantic models.*A\.SemanticModel, B\.SemanticModel/);
  });
  it("takes a dropped definition folder, loose .tmdl files, and a single file", () => {
    expect(
      selectModel([e("definition/model.tmdl"), e("definition/tables/T.tmdl")]).files.map(
        (f) => f.path,
      ),
    ).toEqual(["model.tmdl", "tables/T.tmdl"]);
    const loose = selectModel([e("stuff/a.tmdl"), e("stuff/deeper/b.tmdl")]);
    expect(loose.root).toBe("stuff");
    expect(loose.files.map((f) => f.path)).toEqual(["a.tmdl", "deeper/b.tmdl"]);
    const single = selectModel([e("T.tmdl", "table T\n")]);
    expect(single.root).toBe("");
    expect(single.files).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("uses the nearest pbiplint.config.json at or above the model root", () => {
    const outer = e("Proj/pbiplint.config.json", '{"failOn":"warning"}');
    const inner = e("Proj/Demo.SemanticModel/pbiplint.config.json", '{"failOn":"info"}');
    const model = [e("Proj/Demo.SemanticModel/definition/model.tmdl")];
    expect(selectModel([...model, outer]).config).toEqual({
      path: "Proj/pbiplint.config.json",
      text: outer.text,
    });
    expect(selectModel([...model, outer, inner]).config).toEqual({
      path: "Proj/Demo.SemanticModel/pbiplint.config.json",
      text: inner.text,
    });
  });
  it("sorts files by path so results are stable", () => {
    const m = selectModel([
      e("M.SemanticModel/definition/tables/Z.tmdl"),
      e("M.SemanticModel/definition/tables/A.tmdl"),
    ]);
    expect(m.files.map((f) => f.path)).toEqual([
      "definition/tables/A.tmdl",
      "definition/tables/Z.tmdl",
    ]);
  });
  it("explains an empty drop", () => {
    expect(() => selectModel([e("Proj/Demo.Report/definition/report.json")])).toThrow(InputError);
    expect(() => selectModel([])).toThrow(/No \.tmdl files/);
  });
});
