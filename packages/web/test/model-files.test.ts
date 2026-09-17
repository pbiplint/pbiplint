import { describe, expect, it } from "vitest";
import {
  InputError,
  relativeToRoot,
  selectModel,
  type InputEntry,
} from "../src/input/model-files.js";

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
  it("lists every file it read, relative to the model root, marking the config and what was not linted", () => {
    const m = selectModel([
      e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/notes.tmdl"),
      e("Proj/Other/x.tmdl"),
      e("Proj/pbiplint.config.json", "{}"),
    ]);
    expect(m.root).toBe("Proj/Demo.SemanticModel");
    expect(m.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
    ]);
    expect(m.read).toEqual([
      "../Other/x.tmdl (not linted)",
      "../pbiplint.config.json (config)",
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
      "notes.tmdl (not linted)",
    ]);
    expect(selectModel([e("T.tmdl")]).read).toEqual(["T.tmdl"]);
    const two = selectModel([
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/pbiplint.config.json", "{}"),
      e("Proj/pbiplint.config.json", "{}"),
    ]);
    expect(two.read).toEqual([
      "../pbiplint.config.json (config, not used)",
      "definition/model.tmdl",
      "pbiplint.config.json (config)",
    ]);
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
  it("leaves a .tmdl beside the definition folder unlinted, and says so in what it read", () => {
    // A model with a definition folder is linted from that folder alone, so a stray file next to
    // it (a copy, an export, a note someone saved) is read for the listing and nothing more.
    const m = selectModel([
      e("Demo.SemanticModel/definition/model.tmdl"),
      e("Demo.SemanticModel/scratch.tmdl"),
    ]);
    expect(m.root).toBe("Demo.SemanticModel");
    expect(m.files.map((f) => f.path)).toEqual(["definition/model.tmdl"]);
    expect(m.read).toEqual(["definition/model.tmdl", "scratch.tmdl (not linted)"]);
  });
  it("says what kind of error it is, so a stack trace names it", () => {
    // Nothing on the page reads the name (it matches on the class), but an error that reaches a
    // console or a report reads as "Error: ..." without it, which says nothing about where it came
    // from.
    let thrown: unknown;
    try {
      selectModel([]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(InputError);
    expect((thrown as Error).name).toBe("InputError");
    expect(String(thrown)).toMatch(/^InputError: No \.tmdl files/);
  });
  it("explains an empty drop", () => {
    expect(() => selectModel([e("Proj/Demo.Report/definition/report.json")])).toThrow(InputError);
    expect(() => selectModel([])).toThrow(/No \.tmdl files/);
  });
  it("notes a sibling .SemanticModel folder that holds no .tmdl file, and lints the other", () => {
    const m = selectModel(
      [e("Proj/New.SemanticModel/definition/model.tmdl")],
      ["Proj/New.SemanticModel", "Proj/Old.SemanticModel"],
    );
    expect(m.root).toBe("Proj/New.SemanticModel");
    expect(m.notes).toEqual([
      expect.stringMatching(/^Proj\/Old\.SemanticModel holds no \.tmdl files/),
    ]);
    expect(m.notes[0]).toMatch(/TMDL/);
    expect(
      selectModel([e("Proj/New.SemanticModel/definition/model.tmdl")], ["Proj/New.SemanticModel"])
        .notes,
    ).toEqual([]);
    const two = selectModel(
      [e("Proj/New.SemanticModel/definition/model.tmdl")],
      ["Proj/New.SemanticModel", "Proj/A.SemanticModel", "Proj/B.SemanticModel"],
    );
    expect(two.notes[0]).toMatch(
      /^Proj\/A\.SemanticModel and Proj\/B\.SemanticModel hold no \.tmdl files and were not linted\./,
    );
    const three = selectModel(
      [e("Proj/New.SemanticModel/definition/model.tmdl")],
      [
        "Proj/New.SemanticModel",
        "Proj/A.SemanticModel",
        "Proj/B.SemanticModel",
        "Proj/C.SemanticModel",
      ],
    );
    expect(three.notes[0]).toMatch(
      /^Proj\/A\.SemanticModel, Proj\/B\.SemanticModel, and Proj\/C\.SemanticModel hold no/,
    );
    // The folder may be empty or half copied, so the model.bim cause is offered, not asserted.
    expect(m.notes[0]).toBe(
      "Proj/Old.SemanticModel holds no .tmdl files and was not linted. Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.",
    );
  });
  it("names the model folder when it is the only one and holds no .tmdl file", () => {
    expect(() => selectModel([], ["Proj/Old.SemanticModel"])).toThrow(
      "Proj/Old.SemanticModel holds no .tmdl files. Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.",
    );
  });
});

describe("relativeToRoot", () => {
  it("writes a path at or above the model root the way a shell would", () => {
    expect(relativeToRoot("Proj/Demo.SemanticModel", "Proj/pbiplint.config.json")).toBe(
      "../pbiplint.config.json",
    );
    expect(relativeToRoot("Demo.SemanticModel", "Demo.SemanticModel/pbiplint.config.json")).toBe(
      "pbiplint.config.json",
    );
    expect(relativeToRoot("", "pbiplint.config.json")).toBe("pbiplint.config.json");
    expect(relativeToRoot("a/b/c", "pbiplint.config.json")).toBe("../../../pbiplint.config.json");
    // A path beside the root, not above it, climbs to the shared folder and descends from there.
    expect(relativeToRoot("Proj/Demo.SemanticModel", "Proj/Other/x.tmdl")).toBe("../Other/x.tmdl");
    expect(relativeToRoot("a/b", "c/d.tmdl")).toBe("../../c/d.tmdl");
  });
});
