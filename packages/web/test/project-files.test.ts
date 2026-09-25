import { lint, type Diagnostic } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import {
  emptyTree,
  InputError,
  relativeToRoot,
  selectProject,
  type InputEntry,
  type InputTree,
} from "../src/input/project-files.js";

const e = (path: string, text = `// ${path}\n`): InputEntry => ({ path, text });
/** selectProject on a tree holding these entries and model folders, as selectModel took them. */
const select = (entries: InputEntry[], modelFolders: string[] = []) =>
  selectProject({ ...emptyTree(), entries, modelFolders });
/** The `unread-file` notice the walkers give, in their words. */
const unreadAt = (path: string, reason = "locked"): Diagnostic => ({
  kind: "unread-file",
  path,
  message: `${path} could not be read (${reason}), so it was not linted`,
});

describe("selectProject on a model", () => {
  it("takes a dropped .SemanticModel folder and reports paths relative to it", () => {
    const m = select([
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
  it("finds the one semantic model and the one report inside a dropped PBIP folder, rooted at it", () => {
    const m = select([
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Proj/Demo.Report/definition/report.json"),
    ]);
    expect(m.root).toBe("Proj");
    expect(m.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
      "definition/report.json",
    ]);
  });
  it("refuses a folder with two semantic models and names them", () => {
    expect(() =>
      select([
        e("Proj/A.SemanticModel/definition/model.tmdl"),
        e("Proj/B.SemanticModel/definition/model.tmdl"),
      ]),
    ).toThrow(/2 semantic models.*A\.SemanticModel, B\.SemanticModel/);
  });
  it("takes a dropped definition folder, loose .tmdl files, and a single file", () => {
    const definition = select([e("definition/model.tmdl"), e("definition/tables/T.tmdl")]);
    expect(definition.files.map((f) => f.path)).toEqual(["model.tmdl", "tables/T.tmdl"]);
    // A definition folder dropped alone is its own model root, as the CLI takes one.
    expect(definition.root).toBe("definition");
    const loose = select([e("stuff/a.tmdl"), e("stuff/deeper/b.tmdl")]);
    expect(loose.root).toBe("stuff");
    expect(loose.files.map((f) => f.path)).toEqual(["a.tmdl", "deeper/b.tmdl"]);
    const single = select([e("T.tmdl", "table T\n")]);
    expect(single.root).toBe("");
    expect(single.files).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("uses the nearest pbiplint.config.json at or above the project root", () => {
    const outer = e("Proj/pbiplint.config.json", '{"failOn":"warning"}');
    const inner = e("Proj/Demo.SemanticModel/pbiplint.config.json", '{"failOn":"info"}');
    const model = [e("Proj/Demo.SemanticModel/definition/model.tmdl")];
    expect(select([...model, outer]).config).toEqual({
      path: "Proj/pbiplint.config.json",
      text: outer.text,
    });
    // The project root is the dropped PBIP folder, so a config inside its model folder is below
    // where the search starts, and the CLI would not use it either.
    expect(select([...model, outer, inner]).config).toEqual({
      path: "Proj/pbiplint.config.json",
      text: outer.text,
    });
    // A model folder dropped alone is the root, so its own config is the one.
    const alone = e("Demo.SemanticModel/pbiplint.config.json", '{"failOn":"info"}');
    expect(select([e("Demo.SemanticModel/definition/model.tmdl"), alone]).config).toEqual({
      path: "Demo.SemanticModel/pbiplint.config.json",
      text: alone.text,
    });
  });
  it("lists every file it read, relative to the project root, marking the config and what was not linted", () => {
    const m = select([
      e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/notes.tmdl"),
      e("Proj/Other/x.tmdl"),
      e("Proj/pbiplint.config.json", "{}"),
    ]);
    expect(m.root).toBe("Proj");
    expect(m.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
    ]);
    expect(m.read).toEqual([
      "Demo.SemanticModel/definition/model.tmdl",
      "Demo.SemanticModel/definition/tables/T.tmdl",
      "Demo.SemanticModel/notes.tmdl (not linted)",
      "Other/x.tmdl (not linted)",
      "pbiplint.config.json (config)",
    ]);
    expect(select([e("T.tmdl")]).read).toEqual(["T.tmdl"]);
    const two = select([
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/pbiplint.config.json", "{}"),
      e("Proj/pbiplint.config.json", "{}"),
    ]);
    expect(two.read).toEqual([
      "Demo.SemanticModel/definition/model.tmdl",
      "Demo.SemanticModel/pbiplint.config.json (config, not used)",
      "pbiplint.config.json (config)",
    ]);
  });
  it("sorts files by path so results are stable", () => {
    const m = select([
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
    const m = select([
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
      selectProject(emptyTree());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(InputError);
    expect((thrown as Error).name).toBe("InputError");
    expect(String(thrown)).toMatch(/^InputError: No model or report found/);
  });
  it("explains an empty drop, naming both parts, and reads a report drop as a report", () => {
    expect(() => selectProject(emptyTree())).toThrow(
      "No model or report found. Drop a PBIP folder, a .SemanticModel or .Report folder, or a .tmdl file.",
    );
    expect(() => selectProject(emptyTree())).toThrow(InputError);
    // What the model-only reader refused is a report now.
    const report = select([e("Proj/Demo.Report/definition/report.json")]);
    expect(report.files.map((f) => f.path)).toEqual(["definition/report.json"]);
    expect(report.absent).toEqual({});
  });
  it("notes a sibling .SemanticModel folder that holds no .tmdl file, and lints the other", () => {
    const m = select(
      [e("Proj/New.SemanticModel/definition/model.tmdl")],
      ["Proj/New.SemanticModel", "Proj/Old.SemanticModel"],
    );
    expect(m.root).toBe("Proj");
    expect(m.notes).toEqual([
      expect.stringMatching(/^Proj\/Old\.SemanticModel holds no \.tmdl files/),
    ]);
    expect(m.notes[0]).toMatch(/TMDL/);
    expect(
      select([e("Proj/New.SemanticModel/definition/model.tmdl")], ["Proj/New.SemanticModel"]).notes,
    ).toEqual([]);
    const two = select(
      [e("Proj/New.SemanticModel/definition/model.tmdl")],
      ["Proj/New.SemanticModel", "Proj/A.SemanticModel", "Proj/B.SemanticModel"],
    );
    expect(two.notes[0]).toMatch(
      /^Proj\/A\.SemanticModel and Proj\/B\.SemanticModel hold no \.tmdl files and were not linted\./,
    );
    const three = select(
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
    expect(() => select([], ["Proj/Old.SemanticModel"])).toThrow(
      "Proj/Old.SemanticModel holds no .tmdl files. Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.",
    );
  });
});

describe("selectProject", () => {
  const proj = [
    e("Proj/Demo.pbip"),
    e("Proj/Demo.SemanticModel/definition/model.tmdl"),
    e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
    e(
      "Proj/Demo.Report/definition.pbir",
      JSON.stringify({ datasetReference: { byPath: { path: "../Demo.SemanticModel" } } }),
    ),
    e("Proj/Demo.Report/.platform"),
    e("Proj/Demo.Report/definition/report.json"),
    e("Proj/Demo.Report/definition/pages/p/page.json"),
  ];
  const tree = (entries: InputEntry[], extra: Partial<InputTree> = {}): InputTree => ({
    ...emptyTree(),
    entries,
    modelFolders: ["Proj/Demo.SemanticModel"],
    reportFolders: ["Proj/Demo.Report"],
    ...extra,
  });
  const pbir = (datasetReference: unknown): string => JSON.stringify({ datasetReference });
  /** The PBIP with its definition.pbir replaced. */
  const withPbir = (text: string): InputEntry[] =>
    proj.map((x) => (x.path.endsWith("definition.pbir") ? e(x.path, text) : x));
  it("reads a whole PBIP with part-relative paths and lists what it read", () => {
    const p = selectProject(tree(proj));
    expect(p.root).toBe("Proj");
    // The .pbip sits one level above the report root, so it carries that relative path, as the
    // CLI gives it; the listing names it relative to the project root.
    expect(p.files.map((f) => f.path).sort()).toEqual(
      [
        ".platform",
        "../Demo.pbip",
        "definition.pbir",
        "definition/model.tmdl",
        "definition/pages/p/page.json",
        "definition/report.json",
        "definition/tables/T.tmdl",
      ].sort(),
    );
    expect(p.absent).toEqual({});
    expect([...p.read].sort()).toEqual(
      [
        "Demo.Report/.platform (report)",
        "Demo.Report/definition.pbir (report)",
        "Demo.Report/definition/pages/p/page.json (report)",
        "Demo.Report/definition/report.json (report)",
        "Demo.SemanticModel/definition/model.tmdl",
        "Demo.SemanticModel/definition/tables/T.tmdl",
        "Demo.pbip (report)",
      ].sort(),
    );
    expect(p.diagnostics).toEqual([]);
    expect(p.unreadPaths).toEqual({ model: [], report: [] });
  });
  it("reads a lone .Report, and a report whose model is published, with the model absent and why", () => {
    const lone = selectProject(
      tree(
        proj.filter((x) => x.path.includes(".Report")),
        { modelFolders: [] },
      ),
    );
    expect(lone.absent).toEqual({});
    expect(lone.files.every((f) => !f.path.endsWith(".tmdl"))).toBe(true);
    const published = selectProject(tree(withPbir(pbir({ byConnection: {} }))));
    expect(published.files.some((f) => f.path.endsWith(".tmdl"))).toBe(false);
    expect(published.absent).toEqual({ model: "this report reads a published model" });
  });
  it("refuses two reports, and turns the legacy markers into diagnostics", () => {
    expect(() =>
      selectProject(
        tree([...proj, e("Proj/Other.Report/definition/report.json")], {
          reportFolders: ["Proj/Demo.Report", "Proj/Other.Report"],
        }),
      ),
    ).toThrow(/contains 2 reports; drop one of them: Demo\.Report, Other\.Report/);
    const legacy = selectProject(
      tree(
        proj.filter((x) => !x.path.includes(".Report")),
        { markers: [{ path: "Proj/Demo.Report/report.json", kind: "legacy-report" }] },
      ),
    );
    expect(legacy.absent).toEqual({
      report: "the report is saved in the legacy report.json format",
    });
    expect(legacy.diagnostics.map((d) => d.kind)).toEqual(["legacy-report-format"]);
  });
  it("passes the walk's diagnostics through", () => {
    const p = selectProject(
      tree(proj, { diagnostics: [{ kind: "depth-cap", message: "stopped", path: "x" }] }),
    );
    expect(p.diagnostics[0]).toEqual({ kind: "depth-cap", message: "stopped", path: "x" });
  });

  it("reads a PBIP folder holding a model and a .pbip but no report as the model alone", () => {
    const p = selectProject(
      tree(
        proj.filter((x) => !x.path.includes(".Report")),
        { reportFolders: [] },
      ),
    );
    expect(p.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
    ]);
    // No .pbip joins the files without a report to go with, so no report layer is present with
    // nothing in it (tracked in #59).
    expect(p.absent).toEqual({});
    expect(p.read).toContain("Demo.pbip (not linted)");
    expect(lint(p.files, { absent: p.absent }).layers.report).toEqual({
      present: false,
      reason: "no report in the input",
    });
  });
  it("refuses a lone .pbip, which holds nothing to lint", () => {
    expect(() => selectProject({ ...emptyTree(), entries: [e("Demo.pbip")] })).toThrow(
      "No model or report found. Drop a PBIP folder, a .SemanticModel or .Report folder, or a .tmdl file.",
    );
  });
  it("gives a lone .Report bound to a published model the published-model reason", () => {
    const entries = [
      e("Demo.Report/definition.pbir", pbir({ byConnection: { connectionString: "x" } })),
      e("Demo.Report/definition/report.json"),
    ];
    const p = selectProject({ ...emptyTree(), entries, reportFolders: ["Demo.Report"] });
    expect(p.root).toBe("Demo.Report");
    expect(p.files.map((f) => f.path).sort()).toEqual([
      "definition.pbir",
      "definition/report.json",
    ]);
    expect(p.absent).toEqual({ model: "this report reads a published model" });
    expect(p.diagnostics).toEqual([]);
  });
  it("leaves out a model the report's byPath does not name, with the mismatch and the reason", () => {
    const p = selectProject(
      tree(withPbir(pbir({ byPath: { path: "../Elsewhere.SemanticModel" } }))),
    );
    expect(p.files.some((f) => f.path.endsWith(".tmdl"))).toBe(false);
    expect(p.absent).toEqual({
      model: "this report reads a model outside the input (../Elsewhere.SemanticModel)",
    });
    expect(p.diagnostics).toEqual([
      {
        kind: "model-reference-mismatch",
        path: "Demo.Report/definition.pbir",
        message:
          "Demo.Report/definition.pbir points at ../Elsewhere.SemanticModel, not at Demo.SemanticModel beside it, so the model was not paired with this report",
      },
    ]);
    // The model was read, and is listed as read but not linted.
    expect(p.read).toContain("Demo.SemanticModel/definition/model.tmdl (not linted)");
  });
  it("notes a legacy model beside a lintable one, and gives a legacy model alone its diagnostic", () => {
    const beside = selectProject(
      tree(proj, {
        modelFolders: ["Proj/Demo.SemanticModel", "Proj/Old.SemanticModel"],
        markers: [{ path: "Proj/Old.SemanticModel/model.bim", kind: "legacy-model" }],
      }),
    );
    expect(beside.diagnostics).toEqual([]);
    expect(beside.notes).toEqual([expect.stringMatching(/^Proj\/Old\.SemanticModel holds no/)]);
    const alone = selectProject({
      ...emptyTree(),
      modelFolders: ["Proj/Old.SemanticModel"],
      markers: [{ path: "Proj/Old.SemanticModel/model.bim", kind: "legacy-model" }],
    });
    expect(alone.files).toEqual([]);
    expect(alone.absent).toEqual({ model: "the model is saved in the legacy model.bim format" });
    expect(alone.diagnostics).toEqual([
      {
        kind: "legacy-model-format",
        path: "Old.SemanticModel",
        message:
          "Old.SemanticModel is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop",
      },
    ]);
    // The diagnostic says it, so the note does not say it again.
    expect(alone.notes).toEqual([]);
    // A legacy model folder dropped on its own says the same.
    const part = selectProject({
      ...emptyTree(),
      modelFolders: ["Old.SemanticModel"],
      markers: [{ path: "Old.SemanticModel/model.bim", kind: "legacy-model" }],
    });
    expect(part.root).toBe("Old.SemanticModel");
    expect(part.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
  });
  it("leaves out a part folder that could not be read, saying why", () => {
    const refusal = { path: "Proj/Demo.SemanticModel", reason: "permission revoked" };
    const p = selectProject(
      tree(
        proj.filter((x) => !x.path.includes(".SemanticModel")),
        {
          diagnostics: [unreadAt("Proj/Demo.SemanticModel", "permission revoked")],
          unreadFolders: ["Proj/Demo.SemanticModel"],
          refusal,
        },
      ),
    );
    expect(p.absent).toEqual({ model: "the model folder could not be read" });
    expect(p.diagnostics).toEqual([unreadAt("Proj/Demo.SemanticModel", "permission revoked")]);
    expect(p.files.some((f) => f.path.endsWith(".tmdl"))).toBe(false);
    const report = selectProject(
      tree(
        proj.filter((x) => !x.path.includes(".Report/definition/")),
        {
          diagnostics: [unreadAt("Proj/Demo.Report/definition")],
          unreadFolders: ["Proj/Demo.Report/definition"],
          refusal: { path: "Proj/Demo.Report/definition", reason: "locked" },
        },
      ),
    );
    expect(report.absent).toEqual({ report: "the report folder could not be read" });
  });
  it("refuses a drop of which nothing could be read, naming the path that refused", () => {
    const locked = {
      ...emptyTree(),
      modelFolders: ["Proj/Demo.SemanticModel"],
      diagnostics: [
        unreadAt("Proj/Demo.SemanticModel/definition/model.tmdl", "The file is locked"),
        unreadAt("Proj/Demo.SemanticModel/definition/tables/T.tmdl", "gone"),
      ],
      refusal: {
        path: "Proj/Demo.SemanticModel/definition/model.tmdl",
        reason: "The file is locked",
      },
    };
    expect(() => selectProject(locked)).toThrow(
      new InputError(
        "Could not read Proj/Demo.SemanticModel/definition/model.tmdl: The file is locked",
      ),
    );
    // A dropped folder that could not be listed at all is named by itself.
    expect(() =>
      selectProject({
        ...emptyTree(),
        diagnostics: [unreadAt("Proj", "permission revoked")],
        unreadFolders: ["Proj"],
        refusal: { path: "Proj", reason: "permission revoked" },
      }),
    ).toThrow("Could not read Proj: permission revoked");
    // A path the run would never have read is not the one named: the CLI never opens it.
    expect(() =>
      selectProject({
        ...locked,
        diagnostics: [unreadAt("Proj/Demo.pbip", "busy"), ...locked.diagnostics],
        refusal: { path: "Proj/Demo.pbip", reason: "busy" },
      }),
    ).toThrow("Could not read Proj/Demo.SemanticModel/definition/model.tmdl: The file is locked");
  });
  it("tells each part what it could not read, and drops a notice for a file the run would not have read", () => {
    const p = selectProject(
      tree([...proj.filter((x) => !x.path.endsWith("page.json")), e("Proj/Other/x.tmdl")], {
        diagnostics: [
          unreadAt("Proj/Demo.SemanticModel/definition/tables/Store.tmdl"),
          unreadAt("Proj/Demo.Report/definition/pages/p/page.json"),
          unreadAt("Proj/Other/y.tmdl"),
          unreadAt("Proj/Demo.SemanticModel/.platform"),
        ],
        refusal: { path: "Proj/Demo.SemanticModel/definition/tables/Store.tmdl", reason: "locked" },
      }),
    );
    expect(p.diagnostics).toEqual([
      unreadAt("Proj/Demo.SemanticModel/definition/tables/Store.tmdl"),
      unreadAt("Proj/Demo.Report/definition/pages/p/page.json"),
    ]);
    expect(p.unreadPaths).toEqual({
      model: ["definition/tables/Store.tmdl"],
      report: ["definition/pages/p/page.json"],
    });
    // The project's .pbip and the config the run uses are read too, so their notices stay.
    const pbip = selectProject(
      tree(
        proj.filter((x) => !x.path.endsWith(".pbip")),
        {
          diagnostics: [unreadAt("Proj/Demo.pbip"), unreadAt("Proj/pbiplint.config.json")],
          refusal: { path: "Proj/Demo.pbip", reason: "locked" },
        },
      ),
    );
    expect(pbip.diagnostics.map((d) => d.path)).toEqual([
      "Proj/Demo.pbip",
      "Proj/pbiplint.config.json",
    ]);
    expect(pbip.unreadPaths.report).toEqual(["../Demo.pbip"]);
    expect(pbip.config).toBeUndefined();
  });
  it("tells lint a folder that could not be listed is a folder, under the model and under the report", () => {
    const folders = [
      "Proj/Demo.SemanticModel/definition/tables",
      "Proj/Demo.Report/definition/pages/p/visuals",
    ];
    const p = selectProject(
      tree(proj, {
        diagnostics: folders.map((f) => unreadAt(f)),
        unreadFolders: folders,
        refusal: { path: folders[0]!, reason: "locked" },
      }),
    );
    expect(p.diagnostics).toEqual(folders.map((f) => unreadAt(f)));
    expect(p.unreadPaths).toEqual({
      model: ["definition/tables/"],
      report: ["definition/pages/p/visuals/"],
    });
    const result = lint(p.files, {
      absent: p.absent,
      diagnostics: p.diagnostics,
      unreadPaths: p.unreadPaths,
    });
    expect(result.project.model?.unreadPaths).toEqual(["definition/tables/"]);
    expect(result.project.report?.unreadDefinitionFolders).toEqual(["definition/pages/p/visuals/"]);
    // A folder outside every part is still named, since it could have held one.
    const outside = selectProject(
      tree(proj, {
        diagnostics: [unreadAt("Proj/Archive")],
        unreadFolders: ["Proj/Archive"],
        refusal: { path: "Proj/Archive", reason: "locked" },
      }),
    );
    expect(outside.diagnostics).toEqual([unreadAt("Proj/Archive")]);
    expect(outside.unreadPaths).toEqual({ model: [], report: [] });
  });
  it("refuses two .pbip files beside a report", () => {
    expect(() => selectProject(tree([...proj, e("Proj/Copy.pbip")]))).toThrow(
      "Proj contains 2 .pbip files; drop a folder that holds one of them: Copy.pbip, Demo.pbip",
    );
    // Without a report the .pbip is never read, so two of them refuse nothing.
    expect(() =>
      selectProject(
        tree([...proj.filter((x) => !x.path.includes(".Report")), e("Proj/Copy.pbip")], {
          reportFolders: [],
        }),
      ),
    ).not.toThrow();
  });
  it("roots a lone part at its own folder, and a PBIP at the folder that holds its parts", () => {
    const model = selectProject(
      tree(
        proj
          .filter((x) => x.path.includes(".SemanticModel"))
          .map((x) => e(x.path.replace("Proj/", ""), x.text)),
        { modelFolders: ["Demo.SemanticModel"], reportFolders: [] },
      ),
    );
    expect(model.root).toBe("Demo.SemanticModel");
    const report = selectProject(
      tree(
        proj
          .filter((x) => x.path.includes(".Report"))
          .map((x) => e(x.path.replace("Proj/", ""), x.text)),
        { modelFolders: [], reportFolders: ["Demo.Report"] },
      ),
    );
    expect(report.root).toBe("Demo.Report");
    expect(report.read).toContain("definition/report.json (report)");
    // A PBIP folder holding one part is still the root, and its config is the one used.
    const one = selectProject(
      tree(
        [
          ...proj.filter((x) => x.path.includes(".Report")),
          e("Proj/pbiplint.config.json", "{}"),
          e("Proj/Demo.Report/pbiplint.config.json", "{}"),
        ],
        { modelFolders: [] },
      ),
    );
    expect(one.root).toBe("Proj");
    expect(one.config?.path).toBe("Proj/pbiplint.config.json");
    expect(one.read).toEqual(
      expect.arrayContaining([
        "pbiplint.config.json (config)",
        "Demo.Report/pbiplint.config.json (config, not used)",
      ]),
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
