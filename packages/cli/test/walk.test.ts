import {
  chmodSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  legacyModelNotice,
  legacyReportNotice,
  lint,
  noTmdlRefusal,
  pbixRefusal,
} from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { UsageError } from "../src/args.js";
import { EXPECTED_INPUT, resolveProject } from "../src/walk.js";

const repo = new URL("../../../", import.meta.url).pathname;
const j = (v: unknown) => JSON.stringify(v);

/** A PBIP folder in a temp dir with the parts asked for. */
function pbip(parts: {
  model?: boolean;
  report?: boolean;
  pbir?: unknown;
  legacyReport?: boolean;
  legacyModel?: boolean;
  secondReport?: boolean;
}) {
  const root = tempDir("pbip");
  writeFileSync(
    join(root, "Demo.pbip"),
    j({ version: "1.0", artifacts: [{ report: { path: "Demo.Report" } }] }),
  );
  if (parts.model) {
    mkdirSync(join(root, "Demo.SemanticModel", "definition", "tables"), { recursive: true });
    writeFileSync(
      join(root, "Demo.SemanticModel", ".platform"),
      j({ metadata: { type: "SemanticModel" } }),
    );
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "tables", "T.tmdl"), "table T\n");
  }
  if (parts.legacyModel) {
    mkdirSync(join(root, "Demo.SemanticModel"), { recursive: true });
    writeFileSync(join(root, "Demo.SemanticModel", "model.bim"), "{}");
  }
  if (parts.report) {
    mkdirSync(join(root, "Demo.Report", "definition", "pages", "p", "visuals", "v"), {
      recursive: true,
    });
    mkdirSync(join(root, "Demo.Report", "StaticResources", "RegisteredResources"), {
      recursive: true,
    });
    mkdirSync(join(root, "Demo.Report", ".pbi"), { recursive: true });
    writeFileSync(
      join(root, "Demo.Report", ".platform"),
      j({ metadata: { type: "Report", displayName: "Demo" } }),
    );
    writeFileSync(
      join(root, "Demo.Report", "definition.pbir"),
      j({ datasetReference: parts.pbir ?? { byPath: { path: "../Demo.SemanticModel" } } }),
    );
    writeFileSync(join(root, "Demo.Report", "definition", "report.json"), "{}");
    writeFileSync(
      join(root, "Demo.Report", "definition", "pages", "pages.json"),
      j({ pageOrder: ["p"] }),
    );
    writeFileSync(
      join(root, "Demo.Report", "definition", "pages", "p", "page.json"),
      j({ name: "p", displayName: "P" }),
    );
    writeFileSync(
      join(root, "Demo.Report", "definition", "pages", "p", "visuals", "v", "visual.json"),
      j({ name: "v" }),
    );
    writeFileSync(
      join(root, "Demo.Report", "StaticResources", "RegisteredResources", "theme.json"),
      "{}",
    );
    writeFileSync(join(root, "Demo.Report", ".pbi", "localSettings.json"), "{}");
  }
  if (parts.legacyReport) {
    mkdirSync(join(root, "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", "report.json"), "{}");
  }
  if (parts.secondReport) {
    mkdirSync(join(root, "Other.Report", "definition"), { recursive: true });
    writeFileSync(join(root, "Other.Report", "definition", "report.json"), "{}");
  }
  return root;
}

/** A model folder whose one table is named `table`. */
function modelAt(folder: string, table: string): void {
  mkdirSync(join(folder, "definition", "tables"), { recursive: true });
  writeFileSync(join(folder, "definition", "model.tmdl"), "model Model\n");
  writeFileSync(join(folder, "definition", "tables", `${table}.tmdl`), `table ${table}\n`);
}

/** A report folder of one page whose definition.pbir holds `ref` as its datasetReference. */
function reportAt(folder: string, ref: unknown): void {
  const def = join(folder, "definition");
  mkdirSync(join(def, "pages", "p"), { recursive: true });
  writeFileSync(join(folder, "definition.pbir"), j({ version: "4.0", datasetReference: ref }));
  writeFileSync(join(def, "report.json"), "{}");
  writeFileSync(join(def, "pages", "pages.json"), j({ pageOrder: ["p"] }));
  writeFileSync(join(def, "pages", "p", "page.json"), j({ name: "p", displayName: "P" }));
}

/** A .pbip whose artifacts name each of `reports`, as Microsoft's pbipProperties schema has it. */
function pbipAt(file: string, reports: string[]): void {
  writeFileSync(
    file,
    j({ version: "1.0", artifacts: reports.map((path) => ({ report: { path } })) }),
  );
}

/**
 * Two projects in one folder, Cost and Sales, each a .pbip, a model, and a report that reads it,
 * as mewancegeka/PBIWorkspace holds them (#86).
 */
function workspace(): string {
  const root = tempDir("workspace");
  for (const name of ["Cost", "Sales"]) {
    pbipAt(join(root, `${name}.pbip`), [`${name}.Report`]);
    modelAt(join(root, `${name}.SemanticModel`), name);
    reportAt(join(root, `${name}.Report`), { byPath: { path: `../${name}.SemanticModel` } });
  }
  return root;
}

/** What resolveProject refuses `input` with: its message, and the lines a list prints after it. */
function refusal(input: string): { message: string; lines: readonly string[] } {
  try {
    resolveProject(input);
  } catch (e) {
    if (e instanceof UsageError) return { message: e.message, lines: e.lines };
    throw e;
  }
  throw new Error(`${input} was not refused`);
}

const REPORT_FILES = [
  "definition.pbir",
  "definition/pages/p/page.json",
  "definition/pages/pages.json",
  "definition/report.json",
];

describe("resolveProject", () => {
  it("reads a .SemanticModel folder as v1 did, paths relative to it with forward slashes", () => {
    const p = resolveProject(join(repo, "tests/fixtures/rule-zoo.SemanticModel"));
    expect(p.model!.root.endsWith("rule-zoo.SemanticModel")).toBe(true);
    expect(p.model!.files.map((f) => f.path)).toContain("definition/tables/Sales.tmdl");
    expect(p.model!.files.every((f) => !f.path.includes("\\"))).toBe(true);
    expect(p.model!.files.length).toBe(17);
    expect(p.report).toBeUndefined();
    expect(p.absent).toEqual({});
  });
  it("walks a model's folders in name order, tables before a tables.old beside it (tracked in #101)", () => {
    // project-files.test.ts gives the browser the same backup. As whole paths, tables.old sorts
    // first; the walk goes through tables first, and core reads the files in that order.
    const root = pbip({ model: true });
    const definition = join(root, "Demo.SemanticModel", "definition");
    mkdirSync(join(definition, "tables.old"));
    writeFileSync(
      join(definition, "tables", "Sales.tmdl"),
      "table Sales\n\tcolumn Amount\n\t\tdataType: double\n",
    );
    writeFileSync(
      join(definition, "tables.old", "Sales.tmdl"),
      "table Sales\n\tcolumn 'Old Amount'\n\t\tdataType: double\n",
    );
    const p = resolveProject(root);
    expect(p.model!.files.map((f) => f.path)).toEqual([
      "definition/model.tmdl",
      "definition/tables/Sales.tmdl",
      "definition/tables/T.tmdl",
      "definition/tables.old/Sales.tmdl",
    ]);
    const sales = lint(p.model!.files).model.tables.find((t) => t.name === "Sales")!;
    expect(sales.columns.map((c) => c.name)).toEqual(["Amount", "Old Amount"]);
  });
  it("reads a whole PBIP folder, its .pbip file, and both parts with part-relative paths, never StaticResources or .pbi", () => {
    const root = pbip({ model: true, report: true });
    for (const input of [root, join(root, "Demo.pbip")]) {
      const p = resolveProject(input);
      expect(p.root).toBe(root);
      expect(p.model!.files.map((f) => f.path).sort()).toEqual([
        "definition/model.tmdl",
        "definition/tables/T.tmdl",
      ]);
      expect(p.report!.files.map((f) => f.path).sort()).toEqual([
        "../Demo.pbip",
        ".platform",
        "definition.pbir",
        "definition/pages/p/page.json",
        "definition/pages/p/visuals/v/visual.json",
        "definition/pages/pages.json",
        "definition/report.json",
      ]);
      expect(p.model!.root).toBe(join(root, "Demo.SemanticModel"));
      expect(p.report!.root).toBe(join(root, "Demo.Report"));
      expect(p.diagnostics).toEqual([]);
    }
  });
  it("reads a lone .Report, a lone report definition folder, a model definition folder, and one .tmdl file", () => {
    const root = pbip({ report: true });
    const lone = resolveProject(join(root, "Demo.Report"));
    expect(lone.model).toBeUndefined();
    expect(lone.report!.files.map((f) => f.path)).toContain("definition/pages/p/page.json");
    expect(lone.report!.files.map((f) => f.path)).not.toContain("../Demo.pbip");
    // Its definition.pbir names the model beside it, which the skipped line names in turn, so the
    // reader knows what to lint with it (tracked in #88).
    const notIncluded = {
      model: "this report reads ../Demo.SemanticModel, which this run did not include",
    };
    expect(lone.absent).toEqual(notIncluded);
    const def = resolveProject(join(root, "Demo.Report", "definition"));
    expect(def.report!.root).toBe(join(root, "Demo.Report"));
    expect(def.report!.files.map((f) => f.path)).toContain("definition/report.json");
    expect(def.absent).toEqual(notIncluded);
    const modelRoot = pbip({ model: true });
    expect(
      resolveProject(join(modelRoot, "Demo.SemanticModel", "definition"))
        .model!.files.map((f) => f.path)
        .sort(),
    ).toEqual(["model.tmdl", "tables/T.tmdl"]);
    expect(
      resolveProject(join(modelRoot, "Demo.SemanticModel", "definition", "tables", "T.tmdl")).model!
        .files,
    ).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("reads the .pbip the user named, refuses two in a folder, and ignores a directory named .pbip", () => {
    const root = pbip({ model: true, report: true });
    writeFileSync(join(root, "Another.pbip"), j({ version: "1.0", artifacts: [] }));
    expect(() => resolveProject(root)).toThrow(
      /contains 2 \.pbip files; point at one of them: Another\.pbip, Demo\.pbip/,
    );
    const named = resolveProject(join(root, "Demo.pbip"));
    expect(named.root).toBe(root);
    expect(named.report!.files.map((f) => f.path)).toContain("../Demo.pbip");
    expect(named.report!.files.map((f) => f.path)).not.toContain("../Another.pbip");
    const other = resolveProject(join(root, "Another.pbip"));
    expect(other.report!.files.map((f) => f.path)).toContain("../Another.pbip");
    const solo = pbip({ model: true, report: true });
    mkdirSync(join(solo, "x.pbip"));
    expect(resolveProject(solo).report!.files.map((f) => f.path)).toContain("../Demo.pbip");
  });
  it("leaves the model out when the report reads a published model or another model, and says why", () => {
    const published = resolveProject(
      pbip({ model: true, report: true, pbir: { byConnection: { connectionString: "x" } } }),
    );
    expect(published.model).toBeUndefined();
    expect(published.absent).toEqual({ model: "this report reads a published model" });
    expect(published.diagnostics).toEqual([]);
    const elsewhere = resolveProject(
      pbip({ model: true, report: true, pbir: { byPath: { path: "../Other.SemanticModel" } } }),
    );
    expect(elsewhere.model).toBeUndefined();
    expect(elsewhere.absent.model).toBe(
      "this report reads a model outside the input (../Other.SemanticModel)",
    );
    expect(elsewhere.diagnostics.map((d) => d.kind)).toEqual(["model-reference-mismatch"]);
  });
  it("says a report reads a published model even with no model beside it", () => {
    const thin = pbip({ report: true, pbir: { byConnection: { connectionString: "x" } } });
    const whole = resolveProject(thin);
    expect(whole.model).toBeUndefined();
    expect(whole.absent).toEqual({ model: "this report reads a published model" });
    expect(whole.diagnostics).toEqual([]);
    const lone = resolveProject(join(thin, "Demo.Report"));
    expect(lone.absent).toEqual({ model: "this report reads a published model" });
    expect(lone.diagnostics).toEqual([]);
    const def = resolveProject(join(thin, "Demo.Report", "definition"));
    expect(def.absent).toEqual({ model: "this report reads a published model" });
  });
  it("turns the two legacy formats into diagnostics with the layer absent", () => {
    const legacy = resolveProject(pbip({ model: true, legacyReport: true }));
    expect(legacy.model).toBeDefined();
    expect(legacy.report).toBeUndefined();
    expect(legacy.absent.report).toBe("the report is saved in the legacy report.json format");
    expect(legacy.diagnostics).toEqual([
      {
        kind: "legacy-report-format",
        path: "Demo.Report",
        message:
          "Demo.Report is stored as a single report.json (PBIR-Legacy), which pbiplint cannot read. Power BI Desktop converts it to PBIR when you edit and save it, in releases from September 2026 on. See Microsoft Learn: https://learn.microsoft.com/power-bi/developer/projects/projects-report#convert-existing-report-to-pbir",
      },
    ]);
    const bim = resolveProject(pbip({ legacyModel: true, report: true }));
    expect(bim.model).toBeUndefined();
    expect(bim.absent.model).toBe("the model is saved in the legacy model.bim format");
    expect(bim.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
    // A legacy part alone reads nothing, so it refuses the run (#175).
    const only = join(pbip({ legacyModel: true }), "Demo.SemanticModel");
    expect(() => resolveProject(only)).toThrow(new Error(legacyModelNotice(only).message));
  });
  it("refuses two reports or two models by name and explains what it could not find", () => {
    expect(() => resolveProject(pbip({ report: true, secondReport: true }))).toThrow(
      /contains 2 reports; point at one of them: Demo\.Report, Other\.Report/,
    );
    const empty = tempDir("empty");
    expect(() => resolveProject(empty)).toThrow(/No semantic model or report found/);
    expect(() => resolveProject(join(empty, "missing"))).toThrow(/does not exist/);
    writeFileSync(join(empty, "x.txt"), "");
    expect(() => resolveProject(join(empty, "x.txt"))).toThrow(
      /is not a \.tmdl file, a \.pbip file, or a folder/,
    );
  });
});

describe("resolveProject on a .pbip that names its report (#86)", () => {
  it("lints each project in a shared folder by its .pbip, and still refuses the folder", () => {
    const root = workspace();
    for (const name of ["Cost", "Sales"]) {
      const pbipPath = join(root, `${name}.pbip`);
      const p = resolveProject(pbipPath);
      // The config search and the notices start from the .pbip's folder, as before.
      expect(p.root).toBe(root);
      expect(p.model!.root).toBe(join(root, `${name}.SemanticModel`));
      expect(p.model!.files.map((f) => f.path).sort()).toEqual([
        "definition/model.tmdl",
        `definition/tables/${name}.tmdl`,
      ]);
      expect(p.report!.root).toBe(join(root, `${name}.Report`));
      // The .pbip rides with the report at its path from the report root, and the other
      // project's .pbip, model, and report are neither read nor refused.
      expect(p.report!.files.map((f) => f.path).sort()).toEqual([
        `../${name}.pbip`,
        ...REPORT_FILES,
      ]);
      expect(p.report!.files.find((f) => f.path === `../${name}.pbip`)!.text).toBe(
        j({ version: "1.0", artifacts: [{ report: { path: `${name}.Report` } }] }),
      );
      expect(p.model!.unread).toEqual([]);
      expect(p.report!.unread).toEqual([]);
      expect(p.absent).toEqual({});
      expect(p.diagnostics).toEqual([]);
    }
    // Folder input keeps today's refusal.
    expect(() => resolveProject(root)).toThrow(
      `${root} contains 2 semantic models; point at one of them: Cost.SemanticModel, Sales.SemanticModel`,
    );
  });
  it("refuses a .pbip that names more than one report, naming them as a folder's refusal does", () => {
    const root = workspace();
    const both = join(root, "Both.pbip");
    // A report named twice counts once, by the path it resolves to.
    pbipAt(both, ["Sales.Report", "Cost.Report", "./Sales.Report"]);
    expect(() => resolveProject(both)).toThrow(
      `${both} names 2 reports; point at one of them: Cost.Report, Sales.Report`,
    );
    const twice = join(root, "Twice.pbip");
    pbipAt(twice, ["Cost.Report", "Cost.Report"]);
    const p = resolveProject(twice);
    expect(p.report!.root).toBe(join(root, "Cost.Report"));
    expect(p.model!.root).toBe(join(root, "Cost.SemanticModel"));
  });
  it("refuses a .pbip whose report is not there, naming the path as the .pbip writes it", () => {
    const root = workspace();
    const gone = join(root, "Gone.pbip");
    pbipAt(gone, ["Reports/Gone.Report"]);
    expect(() => resolveProject(gone)).toThrow(
      `${gone} names Reports/Gone.Report, which does not exist`,
    );
    // A report path that is a file, or a folder with nothing to lint, is refused rather than
    // read as a clean run of nothing.
    writeFileSync(join(root, "File.Report"), "");
    pbipAt(gone, ["File.Report"]);
    expect(() => resolveProject(gone)).toThrow(`${gone} names File.Report, which is not a folder`);
    mkdirSync(join(root, "Empty.Report"));
    pbipAt(gone, ["Empty.Report"]);
    // Worded for the report the .pbip names: the input kinds a folder could have held do not apply.
    expect(() => resolveProject(gone)).toThrow(
      new Error(`No semantic model or report found in Empty.Report, which ${gone} names`),
    );
  });
  it("reads a .pbip that names no report as its folder, as before", () => {
    const root = pbip({ model: true, report: true });
    const file = join(root, "Demo.pbip");
    for (const text of [
      "{ not json",
      j([]),
      j({ version: "1.0" }),
      j({ version: "1.0", artifacts: [] }),
      j({ version: "1.0", artifacts: [{ report: {} }, { model: { path: "Demo.SemanticModel" } }] }),
    ]) {
      writeFileSync(file, text);
      const p = resolveProject(file);
      expect(p.root).toBe(root);
      expect(p.model!.root).toBe(join(root, "Demo.SemanticModel"));
      expect(p.report!.root).toBe(join(root, "Demo.Report"));
      expect(p.report!.files.find((f) => f.path === "../Demo.pbip")!.text).toBe(text);
    }
    // Core still reports a .pbip that is not valid JSON.
    writeFileSync(file, "{ not json");
    const broken = resolveProject(file);
    const parse = lint([...broken.model!.files, ...broken.report!.files]).findings.filter(
      (f) => f.ruleId === "PARSE_ISSUE",
    );
    expect(parse.map((f) => f.location?.file)).toEqual(["../Demo.pbip"]);
    // Today's reading still refuses a folder of two projects.
    const shared = workspace();
    writeFileSync(join(shared, "Cost.pbip"), j({ version: "1.0", artifacts: [] }));
    expect(() => resolveProject(join(shared, "Cost.pbip"))).toThrow(
      /contains 2 semantic models; point at one of them/,
    );
  });
  it("reads the report alone when it reads a published model, or names no model, and says why", () => {
    const root = workspace();
    const pbir = join(root, "Cost.Report", "definition.pbir");
    writeFileSync(pbir, j({ datasetReference: { byConnection: { connectionString: "x" } } }));
    const published = resolveProject(join(root, "Cost.pbip"));
    expect(published.model).toBeUndefined();
    expect(published.report!.root).toBe(join(root, "Cost.Report"));
    expect(published.absent).toEqual({ model: "this report reads a published model" });
    expect(published.diagnostics).toEqual([]);
    for (const text of [j({ version: "4.0" }), undefined]) {
      if (text === undefined) rmSync(pbir);
      else writeFileSync(pbir, text);
      const alone = resolveProject(join(root, "Cost.pbip"));
      expect(alone.model).toBeUndefined();
      expect(alone.report!.root).toBe(join(root, "Cost.Report"));
      expect(alone.absent).toEqual({});
      expect(alone.diagnostics).toEqual([]);
    }
  });
  it("reads the report alone when the model its definition.pbir names is not there, naming the path", () => {
    const root = workspace();
    writeFileSync(
      join(root, "Cost.Report", "definition.pbir"),
      j({ datasetReference: { byPath: { path: "../Gone.SemanticModel" } } }),
    );
    const p = resolveProject(join(root, "Cost.pbip"));
    expect(p.model).toBeUndefined();
    expect(p.report!.root).toBe(join(root, "Cost.Report"));
    expect(p.absent).toEqual({
      model: "this report reads a model that is not there (../Gone.SemanticModel)",
    });
    // Following the path, there is no sibling to compare with, so no mismatch.
    expect(p.diagnostics).toEqual([]);
    // A folder that is there and holds no .tmdl files is named as the folder route names it
    // (tracked in #88), where the skipped line said there was no model in the input.
    mkdirSync(join(root, "Empty.SemanticModel"));
    writeFileSync(
      join(root, "Cost.Report", "definition.pbir"),
      j({ datasetReference: { byPath: { path: "../Empty.SemanticModel" } } }),
    );
    const empty = resolveProject(join(root, "Cost.pbip"));
    expect(empty.model).toBeUndefined();
    expect(empty.absent).toEqual({
      model: "this report reads ../Empty.SemanticModel, which this run did not include",
    });
    expect(empty.diagnostics).toEqual([]);
  });
  it("follows definition.pbir to a model outside the .pbip's folder", () => {
    const top = tempDir("outside");
    const root = join(top, "Projects");
    mkdirSync(root);
    pbipAt(join(root, "Cost.pbip"), ["Reports/Cost.Report"]);
    reportAt(join(root, "Reports", "Cost.Report"), {
      byPath: { path: "../../../Shared/X.SemanticModel" },
    });
    modelAt(join(top, "Shared", "X.SemanticModel"), "X");
    // A model beside the report is not the one the report names.
    modelAt(join(root, "Reports", "Cost.SemanticModel"), "Cost");
    const p = resolveProject(join(root, "Cost.pbip"));
    expect(p.root).toBe(root);
    expect(p.report!.root).toBe(join(root, "Reports", "Cost.Report"));
    expect(p.report!.files.map((f) => f.path)).toContain("../../Cost.pbip");
    expect(p.model!.root).toBe(join(top, "Shared", "X.SemanticModel"));
    expect(p.model!.files.map((f) => f.path).sort()).toEqual([
      "definition/model.tmdl",
      "definition/tables/X.tmdl",
    ]);
    expect(p.absent).toEqual({});
    expect(p.diagnostics).toEqual([]);
  });
  it("gives the legacy notices as the folder route does, and a legacy report still names its model", () => {
    const root = workspace();
    rmSync(join(root, "Cost.Report", "definition"), { recursive: true });
    writeFileSync(join(root, "Cost.Report", "report.json"), "{}");
    const legacy = resolveProject(join(root, "Cost.pbip"));
    expect(legacy.report).toBeUndefined();
    expect(legacy.model!.root).toBe(join(root, "Cost.SemanticModel"));
    expect(legacy.absent).toEqual({
      report: "the report is saved in the legacy report.json format",
    });
    expect(legacy.diagnostics).toEqual([
      {
        kind: "legacy-report-format",
        path: "Cost.Report",
        message:
          "Cost.Report is stored as a single report.json (PBIR-Legacy), which pbiplint cannot read. Power BI Desktop converts it to PBIR when you edit and save it, in releases from September 2026 on. See Microsoft Learn: https://learn.microsoft.com/power-bi/developer/projects/projects-report#convert-existing-report-to-pbir",
      },
    ]);
    rmSync(join(root, "Sales.SemanticModel", "definition"), { recursive: true });
    writeFileSync(join(root, "Sales.SemanticModel", "model.bim"), "{}");
    const bim = resolveProject(join(root, "Sales.pbip"));
    expect(bim.model).toBeUndefined();
    expect(bim.report!.root).toBe(join(root, "Sales.Report"));
    expect(bim.absent).toEqual({ model: "the model is saved in the legacy model.bim format" });
    expect(bim.diagnostics.map((d) => [d.kind, d.path])).toEqual([
      ["legacy-model-format", "Sales.SemanticModel"],
    ]);
  });
});

describe("resolveProject on a folder with projects below it (#174)", () => {
  // project-files.test.ts holds the browser to the same trees, and cli.test.ts the command to the
  // sample copied below a folder.
  /** A project in the folder `dir`: its .pbip, its model, and a report that reads the model. */
  function projectAt(dir: string, name = "Demo"): void {
    mkdirSync(dir, { recursive: true });
    pbipAt(join(dir, `${name}.pbip`), [`${name}.Report`]);
    modelAt(join(dir, `${name}.SemanticModel`), name);
    reportAt(join(dir, `${name}.Report`), { byPath: { path: `../${name}.SemanticModel` } });
  }
  /** The notice that names the one project below the input. */
  const below = (path: string) => ({
    kind: "project-below-input",
    path,
    message: `${path} is the only project found below the folder given, so it was linted as if given directly`,
  });
  it("lints the one project one folder down, or two, as if pointed at it, naming it first", () => {
    for (const at of ["sub", join("a", "b")]) {
      const root = tempDir("below");
      projectAt(join(root, at));
      const direct = resolveProject(join(root, at));
      const p = resolveProject(root);
      // Its root, where the config search starts, is the project's, and so is every path.
      expect(p.root).toBe(join(root, at));
      expect(p).toEqual({
        ...direct,
        diagnostics: [below(at.split("\\").join("/")), ...direct.diagnostics],
      });
      expect(p.model!.files.map((f) => f.path).sort()).toEqual([
        "definition/model.tmdl",
        "definition/tables/Demo.tmdl",
      ]);
      expect(p.report!.files.map((f) => f.path).sort()).toEqual(["../Demo.pbip", ...REPORT_FILES]);
    }
  });
  it("refuses a folder with two projects below it, listing each with the command that lints it", () => {
    const root = tempDir("below-two");
    projectAt(join(root, "b", "Sales"));
    projectAt(join(root, "a", "Sales"));
    expect(refusal(root)).toEqual({
      message: `${root} contains 2 projects; point at one of them:`,
      lines: [`  a/Sales: pbiplint ${root}/a/Sales`, `  b/Sales: pbiplint ${root}/b/Sales`],
    });
    // A path a shell would split is quoted, in the double quotes POSIX shells, PowerShell, and cmd
    // all take.
    projectAt(join(root, "c", "Sales copy"));
    expect(refusal(root).lines[2]).toBe(`  c/Sales copy: pbiplint "${root}/c/Sales copy"`);
  });
  it("lints the project beside loose .tmdl files, leaving them out", () => {
    const root = tempDir("below-loose");
    writeFileSync(join(root, "model.tmdl"), "model Model\n");
    mkdirSync(join(root, "snippets"));
    writeFileSync(join(root, "snippets", "T.tmdl"), "table T\n");
    projectAt(join(root, "sub"));
    const p = resolveProject(root);
    expect(p.root).toBe(join(root, "sub"));
    expect(p.model!.root).toBe(join(root, "sub", "Demo.SemanticModel"));
    expect(p.diagnostics).toEqual([below("sub")]);
  });
  it("lints a thin report's .pbip below the folder with the model beside it, or one it follows elsewhere", () => {
    // Beside it, under another name: the folder holding the three, read as a PBIP folder.
    const root = tempDir("below-thin");
    mkdirSync(join(root, "sub"));
    pbipAt(join(root, "sub", "Thin.pbip"), ["Thin.Report"]);
    reportAt(join(root, "sub", "Thin.Report"), { byPath: { path: "../Shared.SemanticModel" } });
    modelAt(join(root, "sub", "Shared.SemanticModel"), "Shared");
    const p = resolveProject(root);
    expect(p.root).toBe(join(root, "sub"));
    expect(p.model!.root).toBe(join(root, "sub", "Shared.SemanticModel"));
    expect(p.report!.root).toBe(join(root, "sub", "Thin.Report"));
    expect(p.absent).toEqual({});
    expect(p.diagnostics).toEqual([below("sub")]);
    // Elsewhere: the .pbip, whose report's definition.pbir names the model, which is no project
    // of its own.
    const apart = tempDir("below-apart");
    mkdirSync(join(apart, "reports"));
    pbipAt(join(apart, "reports", "Thin.pbip"), ["Thin.Report"]);
    reportAt(join(apart, "reports", "Thin.Report"), {
      byPath: { path: "../../models/Shared.SemanticModel" },
    });
    modelAt(join(apart, "models", "Shared.SemanticModel"), "Shared");
    const q = resolveProject(apart);
    expect(q.root).toBe(join(apart, "reports"));
    expect(q.model!.root).toBe(join(apart, "models", "Shared.SemanticModel"));
    expect(q.report!.root).toBe(join(apart, "reports", "Thin.Report"));
    expect(q.diagnostics).toEqual([below("reports/Thin.pbip")]);
  });
  it("lints a report and its model with no .pbip as their folder, and lists each part where the folder holds more", () => {
    const root = tempDir("below-parts");
    modelAt(join(root, "ws", "A.SemanticModel"), "A");
    reportAt(join(root, "ws", "A.Report"), { byPath: { path: "../A.SemanticModel" } });
    const p = resolveProject(root);
    expect(p.root).toBe(join(root, "ws"));
    expect(p.model!.root).toBe(join(root, "ws", "A.SemanticModel"));
    expect(p.report!.root).toBe(join(root, "ws", "A.Report"));
    expect(p.diagnostics).toEqual([below("ws")]);
    // Beside a second pair the folder would be refused, so each part is listed by itself.
    modelAt(join(root, "ws", "B.SemanticModel"), "B");
    reportAt(join(root, "ws", "B.Report"), { byPath: { path: "../B.SemanticModel" } });
    expect(refusal(root).lines.map((l) => l.slice(2, l.indexOf(":")))).toEqual([
      "ws/A.Report",
      "ws/A.SemanticModel",
      "ws/B.Report",
      "ws/B.SemanticModel",
    ]);
    // Projects that share a folder each by its .pbip, which lints both its parts (#86).
    const shared = tempDir("below-shared");
    for (const name of ["Cost", "Sales"]) projectAt(join(shared, "ws"), name);
    expect(refusal(shared).lines).toEqual([
      `  ws/Cost.pbip: pbiplint ${shared}/ws/Cost.pbip`,
      `  ws/Sales.pbip: pbiplint ${shared}/ws/Sales.pbip`,
    ]);
  });
  it("searches neither the folders the walk skips nor a part folder", () => {
    const root = tempDir("below-skips");
    for (const skipped of [".git", "node_modules", "StaticResources", ".pbi", "CustomVisuals"])
      projectAt(join(root, skipped, "Old"));
    projectAt(join(root, "sub"));
    // A project inside a part folder is that part's to read, not a project of its own.
    projectAt(join(root, "sub", "Demo.Report", "nested"));
    expect(resolveProject(root).diagnostics).toEqual([below("sub")]);
  });
  it("searches only a plain folder, and reads loose .tmdl files as before when it finds no project", () => {
    // A folder holding a .pbip is a project, read as before, whatever is below it.
    const root = tempDir("below-pbip");
    pbipAt(join(root, "Demo.pbip"), []);
    projectAt(join(root, "sub"));
    writeFileSync(join(root, "loose.tmdl"), "table Loose\n");
    const p = resolveProject(root);
    expect(p.model!.root).toBe(root);
    expect(p.model!.files.map((f) => f.path)).toContain("loose.tmdl");
    expect(p.diagnostics).toEqual([]);
  });
  it.skipIf(process.platform === "win32")(
    "finds no project behind a link below the folder, which the walk names as before (#59)",
    () => {
      const root = tempDir("below-link");
      const outside = tempDir("outside");
      projectAt(join(outside, "Demo"));
      symlinkSync(join(outside, "Demo"), join(root, "Demo"));
      expect(() => resolveProject(root)).toThrow(
        new Error(
          `Could not read ${root}/Demo: it is a symbolic link, which pbiplint does not follow`,
        ),
      );
    },
  );
  // Root reads a folder whatever its mode, and Windows ignores a mode of 000.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "lints the one project it finds beside a folder it cannot list, which is outside the project",
    () => {
      const root = tempDir("below-locked");
      projectAt(join(root, "sub"));
      const locked = join(root, "locked");
      mkdirSync(locked);
      chmodSync(locked, 0o000);
      try {
        expect(resolveProject(root).diagnostics).toEqual([below("sub")]);
      } finally {
        chmodSync(locked, 0o755);
      }
      // Nor does the folder's own definition folder refuse the run of a project below it that
      // reads nothing but a legacy part: the part's notice does (#175).
      const legacy = tempDir("below-locked-legacy");
      mkdirSync(join(legacy, "sub", "Demo.Report"), { recursive: true });
      writeFileSync(join(legacy, "sub", "Demo.Report", "report.json"), "{}");
      const def = join(legacy, "definition");
      mkdirSync(def);
      chmodSync(def, 0o000);
      try {
        expect(() => resolveProject(legacy)).toThrow(
          new Error(legacyReportNotice(`${legacy}/sub/Demo.Report`).message),
        );
      } finally {
        chmodSync(def, 0o755);
      }
    },
  );
  it("lints a .pbip whose model sits outside the folder by the .pbip, which follows it", () => {
    const top = tempDir("below-outside");
    const root = join(top, "repo");
    mkdirSync(join(root, "sub"), { recursive: true });
    pbipAt(join(root, "sub", "Thin.pbip"), ["Thin.Report"]);
    reportAt(join(root, "sub", "Thin.Report"), {
      byPath: { path: "../../../Shared/Shared.SemanticModel" },
    });
    modelAt(join(top, "Shared", "Shared.SemanticModel"), "Shared");
    const p = resolveProject(root);
    expect(p.model!.root).toBe(join(top, "Shared", "Shared.SemanticModel"));
    expect(p.report!.root).toBe(join(root, "sub", "Thin.Report"));
    expect(p.diagnostics).toEqual([below("sub/Thin.pbip")]);
  });
  it("lints a project in a folder named definition by its .pbip, never as a model's definition folder", () => {
    const root = tempDir("below-definition");
    projectAt(join(root, "x", "definition"));
    const p = resolveProject(root);
    expect(p.model!.root).toBe(join(root, "x", "definition", "Demo.SemanticModel"));
    expect(p.report!.root).toBe(join(root, "x", "definition", "Demo.Report"));
    expect(p.diagnostics).toEqual([below("x/definition/Demo.pbip")]);
  });
});

describe("resolveProject and a .pbix (tracked in #88)", () => {
  const folder = (): string => tempDir("pbix");
  it("names a .pbix given as the input, in any case, and says how to save it as a project", () => {
    const root = folder();
    for (const name of ["Sales.pbix", "Sales.PBIX"]) {
      const file = join(root, name);
      writeFileSync(file, "");
      expect(() => resolveProject(file)).toThrow(new Error(pbixRefusal(file)));
    }
    // One that is not there is still named as not there.
    const gone = join(root, "Gone.pbix");
    expect(() => resolveProject(gone)).toThrow(new Error(`${gone} does not exist`));
  });
  it("names the .pbix a folder holds when it holds nothing to lint, joined to the input", () => {
    const root = folder();
    writeFileSync(join(root, "Sales.pbix"), "");
    expect(() => resolveProject(root)).toThrow(new Error(pbixRefusal(`${root}/Sales.pbix`)));
    // In a folder below the input, and in capitals.
    const deep = folder();
    mkdirSync(join(deep, "Archive"));
    writeFileSync(join(deep, "Archive", "Sales.PBIX"), "");
    expect(() => resolveProject(deep)).toThrow(
      new Error(pbixRefusal(`${deep}/Archive/Sales.PBIX`)),
    );
  });
  it("names the first .pbix its walk meets and counts the others", () => {
    // Each folder's entries in name order, a folder's contents where its name sorts: Archive is
    // walked before Sales.pbix, and in it 2024.pbix is met before Old.pbix.
    const root = folder();
    writeFileSync(join(root, "Sales.pbix"), "");
    mkdirSync(join(root, "Archive"));
    writeFileSync(join(root, "Archive", "Old.pbix"), "");
    expect(() => resolveProject(root)).toThrow(
      new Error(pbixRefusal(`${root}/Archive/Old.pbix`, 1)),
    );
    writeFileSync(join(root, "Archive", "2024.pbix"), "");
    expect(() => resolveProject(root)).toThrow(
      new Error(pbixRefusal(`${root}/Archive/2024.pbix`, 2)),
    );
  });
  it("changes nothing beside a project it lints, a legacy part, or another refusal", () => {
    const lints = pbip({ model: true, report: true });
    const before = resolveProject(lints);
    const beforePbip = resolveProject(join(lints, "Demo.pbip"));
    writeFileSync(join(lints, "Demo.pbix"), "");
    mkdirSync(join(lints, "Archive"));
    writeFileSync(join(lints, "Archive", "Demo.PBIX"), "");
    expect(resolveProject(lints)).toEqual(before);
    expect(resolveProject(join(lints, "Demo.pbip"))).toEqual(beforePbip);
    // A legacy part alone is refused with its notice (#175), a .pbix beside it or not.
    const legacy = pbip({ legacyReport: true });
    const notice = new Error(legacyReportNotice(`${legacy}/Demo.Report`).message);
    expect(() => resolveProject(legacy)).toThrow(notice);
    writeFileSync(join(legacy, "Demo.pbix"), "");
    expect(() => resolveProject(legacy)).toThrow(notice);
    const two = pbip({ report: true, secondReport: true });
    writeFileSync(join(two, "Demo.pbix"), "");
    expect(() => resolveProject(two)).toThrow(
      /contains 2 reports; point at one of them: Demo\.Report, Other\.Report/,
    );
    // A report folder a .pbip names is not walked for loose files, so its refusal stands.
    const named = folder();
    mkdirSync(join(named, "Empty.Report"));
    writeFileSync(join(named, "Empty.Report", "Demo.pbix"), "");
    pbipAt(join(named, "Demo.pbip"), ["Empty.Report"]);
    expect(() => resolveProject(join(named, "Demo.pbip"))).toThrow(
      new Error(
        `No semantic model or report found in Empty.Report, which ${join(named, "Demo.pbip")} names`,
      ),
    );
  });
  it("names a model folder that holds no .tmdl files ahead of a .pbix beside it, as the browser does", () => {
    // Spec section 4; the browser's is pinned on the same tree in project-files.test.ts. Empty,
    // and holding an empty definition folder.
    for (const inside of ["", "definition"]) {
      const root = folder();
      mkdirSync(join(root, "Old.SemanticModel", inside), { recursive: true });
      writeFileSync(join(root, "Sales.pbix"), "");
      expect(() => resolveProject(root), inside).toThrow(
        new Error(noTmdlRefusal([`${root}/Old.SemanticModel`])),
      );
    }
  });
  it("names a .pbix in the folder a .pbip that names no report is read as", () => {
    const root = folder();
    pbipAt(join(root, "Demo.pbip"), []);
    writeFileSync(join(root, "Demo.pbix"), "");
    expect(() => resolveProject(join(root, "Demo.pbip"))).toThrow(
      new Error(pbixRefusal(`${root}/Demo.pbix`)),
    );
  });
  it("never meets a .pbix in a folder it skips, nor takes a folder named like one for one", () => {
    const root = folder();
    for (const skipped of [".git", "node_modules", "StaticResources"]) {
      mkdirSync(join(root, skipped));
      writeFileSync(join(root, skipped, "Sales.pbix"), "");
    }
    mkdirSync(join(root, "Folder.pbix"));
    const nothing = (at: string): Error =>
      new Error(`No semantic model or report found at ${at} (expected ${EXPECTED_INPUT})`);
    expect(() => resolveProject(root)).toThrow(nothing(root));
    expect(() => resolveProject(join(root, "Folder.pbix"))).toThrow(
      nothing(join(root, "Folder.pbix")),
    );
  });
});

// These have the operating system refuse a read, as a POSIX system does for a user (CI runs them
// on Ubuntu). Root reads a folder whatever its mode, and Windows ignores a mode of 000, so they
// skip there.
const noModes = process.platform === "win32" || process.getuid?.() === 0;

describe("resolveProject and what it could not read", () => {
  /** Runs `body` with each path's mode at 000, restoring every mode after. */
  const locked = <T>(paths: string[], body: () => T): T => {
    for (const p of paths) chmodSync(p, 0o000);
    try {
      return body();
    } finally {
      for (const p of paths) chmodSync(p, statSync(p).isDirectory() ? 0o755 : 0o644);
    }
  };
  it.skipIf(noModes)(
    "collects each part's unread paths as it reads that part, relative to its root, a folder with a trailing slash",
    () => {
      const root = pbip({ model: true, report: true });
      const report = join(root, "Demo.Report");
      const p = locked(
        [
          join(root, "Demo.SemanticModel", "definition", "tables"),
          join(report, "definition.pbir"),
          join(report, "definition", "pages", "p", "visuals", "v", "visual.json"),
          join(root, "Demo.pbip"),
        ],
        () => resolveProject(root),
      );
      expect(p.model!.files.map((f) => f.path)).toEqual(["definition/model.tmdl"]);
      expect(p.model!.unread).toEqual(["definition/tables/"]);
      // The report's .pbip rides at its path relative to the report root, as its file would.
      expect(p.report!.unread).toEqual([
        "definition.pbir",
        "definition/pages/p/visuals/v/visual.json",
        "../Demo.pbip",
      ]);
      // The notice itself is unchanged: one per path, relative to the input.
      expect(p.diagnostics.map((d) => d.path)).toEqual([
        "Demo.SemanticModel/definition/tables",
        "Demo.Report/definition.pbir",
        "Demo.Report/definition/pages/p/visuals/v/visual.json",
        "Demo.pbip",
      ]);
      expect(resolveProject(root).report!.unread).toEqual([]);
      expect(resolveProject(root).model!.unread).toEqual([]);
    },
  );
  it.skipIf(noModes)(
    "keeps a report's own list when a part given on its own is read for each layer and the notice is given once",
    () => {
      const root = pbip({ report: true });
      const visuals = join(root, "Demo.Report", "definition", "pages", "p", "visuals");
      // The .Report is read for .tmdl files first, which meets the folder and gives the notice.
      const p = locked([visuals], () => resolveProject(join(root, "Demo.Report")));
      expect(p.diagnostics.map((d) => d.path)).toEqual(["definition/pages/p/visuals"]);
      expect(p.model).toBeUndefined();
      expect(p.report!.unread).toEqual(["definition/pages/p/visuals/"]);
    },
  );
  it.skipIf(noModes)(
    "reads a model's definition folder given directly as the model's root, and a report's from its parent",
    () => {
      const modelRoot = pbip({ model: true });
      const def = join(modelRoot, "Demo.SemanticModel", "definition");
      const model = locked([join(def, "tables")], () => resolveProject(def));
      expect(model.model!.root).toBe(def);
      expect(model.model!.unread).toEqual(["tables/"]);
      const reportRoot = pbip({ report: true });
      const reportDef = join(reportRoot, "Demo.Report", "definition");
      const report = locked([join(reportDef, "pages", "p", "visuals")], () =>
        resolveProject(reportDef),
      );
      expect(report.report!.root).toBe(join(reportRoot, "Demo.Report"));
      expect(report.report!.unread).toEqual(["definition/pages/p/visuals/"]);
    },
  );
  it.skipIf(noModes)(
    "fills each part's unread paths on a .pbip's route, with notices relative to the .pbip's folder",
    () => {
      const top = tempDir("outside-locked");
      const root = join(top, "Projects");
      mkdirSync(root);
      pbipAt(join(root, "Cost.pbip"), ["Cost.Report"]);
      reportAt(join(root, "Cost.Report"), { byPath: { path: "../../Shared/X.SemanticModel" } });
      modelAt(join(top, "Shared", "X.SemanticModel"), "X");
      const p = locked(
        [
          join(root, "Cost.Report", "definition", "pages", "p"),
          join(top, "Shared", "X.SemanticModel", "definition", "tables"),
        ],
        () => resolveProject(join(root, "Cost.pbip")),
      );
      expect(p.report!.unread).toEqual(["definition/pages/p/"]);
      expect(p.model!.unread).toEqual(["definition/tables/"]);
      expect(p.diagnostics.map((d) => d.path)).toEqual([
        "Cost.Report/definition/pages/p",
        "../Shared/X.SemanticModel/definition/tables",
      ]);
      expect(p.absent).toEqual({});
    },
  );
  it.skipIf(noModes)(
    "leaves out a part folder it cannot read on a .pbip's route, and refuses a run that read nothing",
    () => {
      const root = workspace();
      const model = join(root, "Cost.SemanticModel");
      const partly = locked([model], () => resolveProject(join(root, "Cost.pbip")));
      expect(partly.model).toBeUndefined();
      expect(partly.report!.root).toBe(join(root, "Cost.Report"));
      expect(partly.absent).toEqual({ model: "the model folder could not be read" });
      expect(partly.diagnostics.map((d) => d.path)).toEqual(["Cost.SemanticModel"]);
      // A report whose definition folder cannot be listed is left out, and its definition.pbir,
      // read on its own, still names the model.
      const unlisted = locked([join(root, "Cost.Report", "definition")], () =>
        resolveProject(join(root, "Cost.pbip")),
      );
      expect(unlisted.report).toBeUndefined();
      expect(unlisted.model!.root).toBe(model);
      expect(unlisted.absent).toEqual({ report: "the report folder could not be read" });
      expect(unlisted.diagnostics.map((d) => d.path)).toEqual(["Cost.Report/definition"]);
      // The report's definition.pbir is how the model is reached, so a report folder that cannot
      // be entered leaves nothing read, and the run is refused naming the path joined to the
      // .pbip's folder.
      expect(() =>
        locked([join(root, "Cost.Report")], () => resolveProject(join(root, "Cost.pbip"))),
      ).toThrow(`Could not read ${root}/Cost.Report: EACCES: permission denied`);
    },
  );
  it.skipIf(noModes)(
    "names the path its walk meets first when nothing could be read, as the browser names it",
    () => {
      // The trees packages/web/test/project-files.test.ts drops: a folder is walked into where
      // its name sorts, so tables/Sales.tmdl is met before tables.old, and a report's
      // definition.pbir is read before its .platform and its definition folder.
      const root = tempDir("first-refused");
      const def = join(root, "Demo.SemanticModel", "definition");
      const tableIn = (folder: string): void => {
        mkdirSync(join(def, folder), { recursive: true });
        writeFileSync(join(def, folder, "Sales.tmdl"), "table Sales\n");
      };
      tableIn("tables");
      tableIn("tables.old");
      const model = join(root, "Demo.SemanticModel");
      const sales = join(def, "tables", "Sales.tmdl");
      expect(() => locked([join(def, "tables.old"), sales], () => resolveProject(model))).toThrow(
        `Could not read ${model}/definition/tables/Sales.tmdl: EACCES: permission denied`,
      );
      tableIn("cultures");
      expect(() =>
        locked([sales, join(def, "tables.old"), join(def, "cultures")], () =>
          resolveProject(model),
        ),
      ).toThrow(`Could not read ${model}/definition/cultures: EACCES: permission denied`);
      const report = join(root, "Demo.Report");
      reportAt(report, { byPath: { path: "../Demo.SemanticModel" } });
      writeFileSync(join(report, ".platform"), "{}");
      rmSync(join(report, "definition", "pages"), { recursive: true });
      const files = ["definition/report.json", ".platform", "definition.pbir"];
      expect(() =>
        locked(
          files.map((f) => join(report, f)),
          () => resolveProject(report),
        ),
      ).toThrow(`Could not read ${report}/definition.pbir: EACCES: permission denied`);
    },
  );
  it.skipIf(noModes)(
    "names a .pbix it could not open, since it never opens one, and refuses a failed read as before",
    () => {
      const root = tempDir("pbix-locked");
      const file = join(root, "Sales.pbix");
      writeFileSync(file, "");
      expect(() => locked([file], () => resolveProject(file))).toThrow(
        new Error(pbixRefusal(file)),
      );
      expect(() => locked([file], () => resolveProject(root))).toThrow(
        new Error(pbixRefusal(`${root}/Sales.pbix`)),
      );
      // A read that failed is what the run is refused for, as it is today.
      mkdirSync(join(root, "tables"));
      writeFileSync(join(root, "tables", "T.tmdl"), "table T\n");
      expect(() => locked([join(root, "tables")], () => resolveProject(root))).toThrow(
        new Error(`Could not read ${root}/tables: EACCES: permission denied`),
      );
    },
  );
  it.skipIf(noModes)(
    "leaves the model out with a reason when the named report's definition.pbir cannot be read",
    () => {
      const root = workspace();
      const reason = "the report's definition.pbir could not be read";
      // A report read without its definition.pbir: the path is on the part's unread list.
      const cost = join(root, "Cost.Report", "definition.pbir");
      const read = locked([cost], () => resolveProject(join(root, "Cost.pbip")));
      expect(read.report!.unread).toEqual(["definition.pbir"]);
      expect(read.model).toBeUndefined();
      expect(read.absent).toEqual({ model: reason });
      expect(read.diagnostics.map((d) => d.path)).toEqual(["Cost.Report/definition.pbir"]);
      // A legacy report, whose definition.pbir is read on its own, leaves nothing to read when
      // that file refuses, so the run is refused naming it.
      rmSync(join(root, "Sales.Report", "definition"), { recursive: true });
      writeFileSync(join(root, "Sales.Report", "report.json"), "{}");
      const sales = join(root, "Sales.Report", "definition.pbir");
      expect(() => locked([sales], () => resolveProject(join(root, "Sales.pbip")))).toThrow(
        `Could not read ${root}/Sales.Report/definition.pbir: EACCES: permission denied`,
      );
    },
  );
});

describe("resolveProject and a model folder that holds no .tmdl files (tracked in #88)", () => {
  // The words are core's, written out in route.test.ts; these hold which folders are named, how,
  // and in what order. project-files.test.ts holds the browser to the same trees, naming each
  // folder relative to the drop where these join it to the input.
  const folder = (): string => tempDir("notmdl");
  /** What a model folder holding no .tmdl files holds instead, for emptyModel. */
  const leftovers = ["", "definition", ".platform"] as const;
  /** A model folder at `at`: empty, holding an empty definition folder, or only its .platform. */
  function emptyModel(at: string, inside: (typeof leftovers)[number]): void {
    mkdirSync(join(at, inside === ".platform" ? "" : inside), { recursive: true });
    if (inside === ".platform")
      writeFileSync(join(at, ".platform"), j({ metadata: { type: "SemanticModel" } }));
  }
  it("names a lone model folder given as the input", () => {
    for (const inside of leftovers) {
      const model = join(folder(), "Old.SemanticModel");
      emptyModel(model, inside);
      expect(() => resolveProject(model), inside).toThrow(new Error(noTmdlRefusal([model])));
    }
  });
  it("names the model folder a folder holds, joined to the input", () => {
    for (const inside of leftovers) {
      const root = folder();
      emptyModel(join(root, "Old.SemanticModel"), inside);
      expect(() => resolveProject(root), inside).toThrow(
        new Error(noTmdlRefusal([`${root}/Old.SemanticModel`])),
      );
    }
  });
  it("names one below that, the one project there, and lists several as projects in name order", () => {
    // The one model folder below a plain folder is the one project there (#174), which, pointed
    // at, is refused naming it, joined to the input as before.
    const root = folder();
    mkdirSync(join(root, "Models", "Old.SemanticModel"), { recursive: true });
    expect(() => resolveProject(root)).toThrow(
      new Error(noTmdlRefusal([`${root}/Models/Old.SemanticModel`])),
    );
    // One under a folder the walk skips is never met, so never named, as the browser's walkers
    // skip the same folders.
    for (const skipped of ["node_modules", "StaticResources"])
      mkdirSync(join(root, skipped, "Skipped.SemanticModel"), { recursive: true });
    expect(() => resolveProject(root)).toThrow(
      new Error(noTmdlRefusal([`${root}/Models/Old.SemanticModel`])),
    );
    // Several are several projects, listed as the browser lists them, each to be pointed at. The
    // order is the whole path's, not the order the walk meets them: the walk is through Archive
    // before it reaches Archive 2024, but "Archive 2024/" sorts before "Archive/".
    const two = folder();
    mkdirSync(join(two, "Sales", "Sales.SemanticModel"), { recursive: true });
    mkdirSync(join(two, "Archive", "Old.SemanticModel"), { recursive: true });
    mkdirSync(join(two, "Archive 2024", "Older.SemanticModel"), { recursive: true });
    expect(refusal(two)).toEqual({
      message: `${two} contains 3 projects; point at one of them:`,
      lines: [
        `  Archive 2024/Older.SemanticModel: pbiplint "${two}/Archive 2024/Older.SemanticModel"`,
        `  Archive/Old.SemanticModel: pbiplint ${two}/Archive/Old.SemanticModel`,
        `  Sales/Sales.SemanticModel: pbiplint ${two}/Sales/Sales.SemanticModel`,
      ],
    });
  });
  it("lints what it linted beside one, as before, and still refuses two model folders side by side", () => {
    // Beside a report it lints: the report alone, where the browser notes the folder. The skipped
    // line names the model the report reads, which this run did not include, and says no more,
    // since the folder is in the input (tracked in #88).
    const root = folder();
    mkdirSync(join(root, "Old.SemanticModel"));
    reportAt(join(root, "Demo.Report"), { byPath: { path: "../Old.SemanticModel" } });
    const report = resolveProject(root);
    expect(report.report!.root).toBe(join(root, "Demo.Report"));
    expect(report.model).toBeUndefined();
    expect(report.absent).toEqual({
      model: "this report reads ../Old.SemanticModel, which this run did not include",
    });
    expect(report.diagnostics).toEqual([]);
    // Below a folder that holds a model it lints: that model.
    const nested = folder();
    modelAt(join(nested, "Demo.SemanticModel"), "T");
    mkdirSync(join(nested, "Archive", "Old.SemanticModel"), { recursive: true });
    const model = resolveProject(nested);
    expect(model.model!.root).toBe(join(nested, "Demo.SemanticModel"));
    expect(model.diagnostics).toEqual([]);
    // Beside that model: two semantic models, as before (spec section 12), where the browser
    // lints the one and notes the other.
    mkdirSync(join(nested, "Old.SemanticModel"));
    expect(() => resolveProject(nested)).toThrow(
      new Error(
        `${nested} contains 2 semantic models; point at one of them: Demo.SemanticModel, Old.SemanticModel`,
      ),
    );
  });
  it("refuses a legacy model folder with its notice, not the no-.tmdl refusal, and one further down too, as the one project there", () => {
    // A run that reads nothing is refused (#175); the legacy notice says why.
    const root = folder();
    mkdirSync(join(root, "Old.SemanticModel"));
    writeFileSync(join(root, "Old.SemanticModel", "model.bim"), "{}");
    const part = join(root, "Old.SemanticModel");
    expect(() => resolveProject(part)).toThrow(new Error(legacyModelNotice(part).message));
    expect(() => resolveProject(root)).toThrow(new Error(legacyModelNotice(part).message));
    // Further down, it is the one project below the folder (#174), read as if pointed at, which
    // looks for its model.bim, as the browser does.
    const deep = folder();
    mkdirSync(join(deep, "Models", "Old.SemanticModel"), { recursive: true });
    writeFileSync(join(deep, "Models", "Old.SemanticModel", "model.bim"), "{}");
    expect(() => resolveProject(deep)).toThrow(
      new Error(legacyModelNotice(`${deep}/Models/Old.SemanticModel`).message),
    );
  });
  it.skipIf(noModes)(
    "refuses a run of which nothing could be read naming what refused, as before",
    () => {
      const root = folder();
      mkdirSync(join(root, "Old.SemanticModel"));
      const locked = join(root, "Locked");
      mkdirSync(locked);
      chmodSync(locked, 0o000);
      try {
        expect(() => resolveProject(root)).toThrow(
          new Error(`Could not read ${root}/Locked: EACCES: permission denied`),
        );
      } finally {
        chmodSync(locked, 0o755);
      }
    },
  );
});

describe("resolveProject and symbolic links (#59)", () => {
  // Windows makes a symbolic link only in Developer Mode or as an administrator, so these skip
  // there (CI runs them on Ubuntu).
  const noLinks = process.platform === "win32";
  const linkNotice = (path: string) => ({
    kind: "unread-file",
    path,
    message: `${path} is a symbolic link, which pbiplint does not follow, so it was not linted`,
  });
  /** Moves `p` into `outside` and puts a link to it where it was. */
  const moveBehindLink = (p: string, outside: string): void => {
    const moved = join(outside, basename(p));
    renameSync(p, moved);
    symlinkSync(moved, p);
  };

  it.skipIf(noLinks)(
    "names a linked folder or file below the input, reads nothing through it, and lints the rest",
    () => {
      const root = pbip({ model: true, report: true });
      const outside = tempDir("outside");
      moveBehindLink(join(root, "Demo.Report", "definition", "pages"), outside);
      moveBehindLink(join(root, "Demo.SemanticModel", "definition", "tables", "T.tmdl"), outside);
      const p = resolveProject(root);
      expect(p.report!.files.map((f) => f.path).sort()).toEqual([
        "../Demo.pbip",
        ".platform",
        "definition.pbir",
        "definition/report.json",
      ]);
      expect(p.report!.unread).toEqual(["definition/pages/"]);
      expect(p.model!.files.map((f) => f.path)).toEqual(["definition/model.tmdl"]);
      expect(p.model!.unread).toEqual(["definition/tables/T.tmdl"]);
      expect(p.diagnostics).toEqual([
        linkNotice("Demo.SemanticModel/definition/tables/T.tmdl"),
        linkNotice("Demo.Report/definition/pages"),
      ]);
      expect(p.absent).toEqual({});
    },
  );
  it.skipIf(noLinks)(
    "names a link that points nowhere, or at itself, where the walk would have read or entered it",
    () => {
      const root = pbip({ report: true });
      const def = join(root, "Demo.Report", "definition");
      symlinkSync(join(root, "gone.json"), join(def, "gone.json"));
      symlinkSync(join(def, "loop"), join(def, "loop"));
      const p = resolveProject(root);
      expect(p.report!.unread).toEqual(["definition/gone.json", "definition/loop/"]);
      expect(p.diagnostics).toEqual([
        linkNotice("Demo.Report/definition/gone.json"),
        linkNotice("Demo.Report/definition/loop"),
      ]);
    },
  );
  it.skipIf(noLinks)("says nothing of a link the walk would neither read nor enter", () => {
    const root = pbip({ model: true, report: true });
    const outside = tempDir("outside");
    writeFileSync(join(outside, "notes.txt"), "");
    mkdirSync(join(outside, "resources"));
    symlinkSync(join(outside, "notes.txt"), join(root, "Demo.Report", "definition", "notes.txt"));
    symlinkSync(
      join(outside, "resources"),
      join(root, "Demo.Report", "definition", "StaticResources"),
    );
    symlinkSync(join(outside, "resources"), join(root, ".git"));
    const p = resolveProject(root);
    expect(p.diagnostics).toEqual([]);
    expect(p.report!.unread).toEqual([]);
  });
  it.skipIf(noLinks)(
    "names a linked part folder beside the other part and leaves its layer out, as a folder it cannot read",
    () => {
      const model = pbip({ model: true, report: true });
      moveBehindLink(join(model, "Demo.SemanticModel"), tempDir("outside"));
      const noModel = resolveProject(model);
      expect(noModel.model).toBeUndefined();
      expect(noModel.report).toBeDefined();
      expect(noModel.absent).toEqual({ model: "the model folder could not be read" });
      expect(noModel.diagnostics).toEqual([linkNotice("Demo.SemanticModel")]);
      const report = pbip({ model: true, report: true });
      moveBehindLink(join(report, "Demo.Report"), tempDir("outside"));
      const noReport = resolveProject(report);
      expect(noReport.report).toBeUndefined();
      expect(noReport.model).toBeDefined();
      expect(noReport.absent).toEqual({ report: "the report folder could not be read" });
      expect(noReport.diagnostics).toEqual([linkNotice("Demo.Report")]);
    },
  );
  it.skipIf(noLinks)(
    "names a part's linked definition folder, definition.pbir, or .platform, and the .pbip beside the parts",
    () => {
      const root = pbip({ model: true, report: true });
      const outside = tempDir("outside");
      moveBehindLink(join(root, "Demo.SemanticModel", "definition"), outside);
      moveBehindLink(join(root, "Demo.Report", "definition.pbir"), outside);
      moveBehindLink(join(root, "Demo.Report", ".platform"), outside);
      moveBehindLink(join(root, "Demo.pbip"), outside);
      const p = resolveProject(root);
      expect(p.model).toBeUndefined();
      expect(p.report!.files.map((f) => f.path)).not.toContain("definition.pbir");
      expect(p.report!.unread).toEqual(["definition.pbir", ".platform", "../Demo.pbip"]);
      expect(p.diagnostics).toEqual([
        linkNotice("Demo.SemanticModel/definition"),
        linkNotice("Demo.Report/definition.pbir"),
        linkNotice("Demo.Report/.platform"),
        linkNotice("Demo.pbip"),
      ]);
      expect(p.absent).toEqual({ model: "the model folder could not be read" });
    },
  );
  it.skipIf(noLinks)(
    "names a report folder a .pbip names, or the model its definition.pbir names, when it is a link",
    () => {
      const noModel = workspace();
      moveBehindLink(join(noModel, "Cost.SemanticModel"), tempDir("outside"));
      const p = resolveProject(join(noModel, "Cost.pbip"));
      expect(p.model).toBeUndefined();
      expect(p.report!.root).toBe(join(noModel, "Cost.Report"));
      expect(p.absent).toEqual({ model: "the model folder could not be read" });
      expect(p.diagnostics).toEqual([linkNotice("Cost.SemanticModel")]);
      // The report is how the model is reached, so a linked report leaves nothing read, and the
      // run is refused naming it, as a report folder that cannot be entered is.
      const noReport = workspace();
      moveBehindLink(join(noReport, "Cost.Report"), tempDir("outside"));
      expect(() => resolveProject(join(noReport, "Cost.pbip"))).toThrow(
        new Error(
          `Could not read ${noReport}/Cost.Report: it is a symbolic link, which pbiplint does not follow`,
        ),
      );
    },
  );
  it.skipIf(noLinks)("refuses a run that could read nothing but a link, naming the link", () => {
    const root = tempDir("only-link");
    const outside = tempDir("outside");
    modelAt(join(outside, "Demo.SemanticModel"), "T");
    symlinkSync(join(outside, "Demo.SemanticModel"), join(root, "Demo.SemanticModel"));
    expect(() => resolveProject(root)).toThrow(
      new Error(
        `Could not read ${root}/Demo.SemanticModel: it is a symbolic link, which pbiplint does not follow`,
      ),
    );
  });
  it.skipIf(noLinks)("follows the input itself when it is a link, as the user named it", () => {
    const root = pbip({ model: true, report: true });
    /** A link to `target` in a folder of its own, so no other link sits beside it. */
    const linkTo = (target: string): string => {
      const link = join(tempDir("link"), basename(target));
      symlinkSync(target, link);
      return link;
    };
    const whole = resolveProject(linkTo(root));
    expect(whole.model!.files).toHaveLength(2);
    expect(whole.report!.files).toHaveLength(7);
    expect(whole.diagnostics).toEqual([]);
    for (const part of [join(root, "Demo.Report"), join(root, "Demo.Report", "definition")]) {
      const lone = resolveProject(linkTo(part));
      expect(lone.report!.files.map((f) => f.path)).toContain("definition/report.json");
      expect(lone.diagnostics).toEqual([]);
    }
    // A file is followed to where it sits, so the report a .pbip names is found beside the real
    // .pbip, and that folder is the project root.
    const named = resolveProject(linkTo(join(root, "Demo.pbip")));
    expect(named.root).toBe(realpathSync(root));
    expect(named.model!.files).toHaveLength(2);
    expect(named.report!.files.map((f) => f.path)).toContain("../Demo.pbip");
    expect(named.diagnostics).toEqual([]);
    // A .tmdl file is read at the link, as a folder is walked where its link sits.
    const tmdl = linkTo(join(root, "Demo.SemanticModel", "definition", "tables", "T.tmdl"));
    const alone = resolveProject(tmdl);
    expect(alone.root).toBe(dirname(tmdl));
    expect(alone.model!.files).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it.skipIf(noLinks)("knows a linked input by the name the user gave it", () => {
    const outside = tempDir("outside");
    writeFileSync(join(outside, "real.zip"), "");
    writeFileSync(join(outside, "real.txt"), "table T\n");
    const links = tempDir("links");
    symlinkSync(join(outside, "real.zip"), join(links, "Sales.pbix"));
    symlinkSync(join(outside, "real.txt"), join(links, "T.tmdl"));
    expect(() => resolveProject(join(links, "Sales.pbix"))).toThrow(
      new Error(pbixRefusal(join(links, "Sales.pbix"))),
    );
    expect(resolveProject(join(links, "T.tmdl")).model!.files).toEqual([
      { path: "T.tmdl", text: "table T\n" },
    ]);
  });
  it.skipIf(noLinks)(
    "names a link partway along the path a .pbip or a definition.pbir writes, and reads nothing through it",
    () => {
      // Desktop writes one folder name, but a path written by hand can pass through a link.
      const viaModel = tempDir("via-model");
      const outside = tempDir("outside");
      pbipAt(join(viaModel, "Cost.pbip"), ["Cost.Report"]);
      reportAt(join(viaModel, "Cost.Report"), { byPath: { path: "../Shared/X.SemanticModel" } });
      modelAt(join(outside, "X.SemanticModel"), "X");
      symlinkSync(outside, join(viaModel, "Shared"));
      const p = resolveProject(join(viaModel, "Cost.pbip"));
      expect(p.model).toBeUndefined();
      expect(p.report).toBeDefined();
      expect(p.absent).toEqual({ model: "the model folder could not be read" });
      expect(p.diagnostics).toEqual([linkNotice("Shared")]);
      const viaReport = tempDir("via-report");
      const elsewhere = tempDir("elsewhere");
      pbipAt(join(viaReport, "Cost.pbip"), ["Sub/Cost.Report"]);
      reportAt(join(elsewhere, "Cost.Report"), { byPath: { path: "../Cost.SemanticModel" } });
      modelAt(join(elsewhere, "Cost.SemanticModel"), "Cost");
      symlinkSync(elsewhere, join(viaReport, "Sub"));
      expect(() => resolveProject(join(viaReport, "Cost.pbip"))).toThrow(
        new Error(
          `Could not read ${viaReport}/Sub: it is a symbolic link, which pbiplint does not follow`,
        ),
      );
      // Above the project folder too: only the folders the two paths share are followed.
      const top = tempDir("above");
      const projects = join(top, "Projects");
      mkdirSync(projects);
      pbipAt(join(projects, "Cost.pbip"), ["Cost.Report"]);
      reportAt(join(projects, "Cost.Report"), { byPath: { path: "../../Shared/X.SemanticModel" } });
      modelAt(join(outside, "X.SemanticModel"), "X");
      symlinkSync(outside, join(top, "Shared"));
      const above = resolveProject(join(projects, "Cost.pbip"));
      expect(above.model).toBeUndefined();
      expect(above.absent).toEqual({ model: "the model folder could not be read" });
      expect(above.diagnostics).toEqual([linkNotice("../Shared")]);
    },
  );
  it.skipIf(noLinks)(
    "takes a link whose target is missing as a file, so it is no part folder, and names a part's own",
    () => {
      // A missing target is no folder: beside a model it is no second model, and the model lints.
      const root = pbip({ model: true });
      symlinkSync(join(root, "gone"), join(root, "Other.SemanticModel"));
      const p = resolveProject(root);
      expect(p.model!.root).toBe(join(root, "Demo.SemanticModel"));
      expect(p.diagnostics).toEqual([]);
      // A part given on its own whose definition folder is a link, to nothing or to a file, is
      // refused naming it: the part's definition is what the part is read from.
      for (const target of ["gone", "file.json"]) {
        const part = join(tempDir("part"), "Demo.Report");
        mkdirSync(part);
        writeFileSync(join(part, "file.json"), "{}");
        symlinkSync(join(part, target), join(part, "definition"));
        expect(() => resolveProject(part)).toThrow(
          new Error(
            `Could not read ${part}/definition: it is a symbolic link, which pbiplint does not follow`,
          ),
        );
      }
      // A plain folder is no part, so a definition link to nothing there is passed over as any
      // link to nothing is.
      const plain = tempDir("plain");
      writeFileSync(join(plain, "model.tmdl"), "model Model\n");
      symlinkSync(join(plain, "gone"), join(plain, "definition"));
      const loose = resolveProject(plain);
      expect(loose.model!.files.map((f) => f.path)).toEqual(["model.tmdl"]);
      expect(loose.diagnostics).toEqual([]);
    },
  );
});

describe("resolveProject and the layouts nothing else pins", () => {
  it("reads a PBIP folder that holds a model and no report as the model alone", () => {
    const p = resolveProject(pbip({ model: true }));
    expect(p.model!.files.map((f) => f.path).sort()).toEqual([
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
    ]);
    expect(p.report).toBeUndefined();
    expect(p.absent).toEqual({});
    expect(p.diagnostics).toEqual([]);
  });
  it("reads loose .tmdl files anywhere under a plain folder as v1 did, relative to that folder", () => {
    const root = tempDir("loose");
    mkdirSync(join(root, "a", "b"), { recursive: true });
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "model.tmdl"), "model Model\n");
    writeFileSync(join(root, "a", "b", "T.tmdl"), "table T\n");
    writeFileSync(join(root, "a", "notes.md"), "");
    writeFileSync(join(root, "node_modules", "X.tmdl"), "table X\n");
    const p = resolveProject(root);
    expect(p.model!.root).toBe(root);
    expect(p.model!.files).toEqual([
      { path: "a/b/T.tmdl", text: "table T\n" },
      { path: "model.tmdl", text: "model Model\n" },
    ]);
    expect(p.report).toBeUndefined();
  });
  it("gives a report's published model as the reason over a legacy model beside it, keeping the legacy notice", () => {
    // What the report itself says comes first (pairingDecision), so the skipped line says the
    // report reads a published model, and the notice still says the model folder is model.bim.
    const p = resolveProject(
      pbip({ legacyModel: true, report: true, pbir: { byConnection: { connectionString: "x" } } }),
    );
    expect(p.model).toBeUndefined();
    expect(p.absent).toEqual({ model: "this report reads a published model" });
    expect(p.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
  });
});

describe("resolveProject and a run that reads nothing but legacy parts (#175)", () => {
  // A legacy part alone used to be a notice on a run of 0 files, which read as clean. The run is
  // refused with exit 2 instead, its message the part's notice, the path joined to the input as
  // the nothing-read refusal joins its own.
  const report = (path: string): string => legacyReportNotice(path).message;
  const model = (path: string): string => legacyModelNotice(path).message;
  it("refuses a legacy report alone, from its PBIP folder and given directly", () => {
    const root = pbip({ legacyReport: true });
    expect(refusal(root)).toEqual({ message: report(`${root}/Demo.Report`), lines: [] });
    const part = join(root, "Demo.Report");
    expect(refusal(part)).toEqual({ message: report(part), lines: [] });
  });
  it("refuses a legacy model alone, from its PBIP folder and given directly", () => {
    const root = pbip({ legacyModel: true });
    expect(refusal(root)).toEqual({ message: model(`${root}/Demo.SemanticModel`), lines: [] });
    const part = join(root, "Demo.SemanticModel");
    expect(refusal(part)).toEqual({ message: model(part), lines: [] });
  });
  it("refuses both legacy parts, naming each in the order the walk meets them", () => {
    const root = pbip({ legacyModel: true, legacyReport: true });
    expect(refusal(root)).toEqual({
      message: model(`${root}/Demo.SemanticModel`),
      lines: [report(`${root}/Demo.Report`)],
    });
    // By the .pbip, the report comes first, and the model is the one its definition.pbir names.
    writeFileSync(
      join(root, "Demo.Report", "definition.pbir"),
      j({ datasetReference: { byPath: { path: "../Demo.SemanticModel" } } }),
    );
    expect(refusal(join(root, "Demo.pbip"))).toEqual({
      message: report(`${root}/Demo.Report`),
      lines: [model(`${root}/Demo.SemanticModel`)],
    });
  });
  it("refuses a .pbip whose report is legacy and names a published model", () => {
    const root = pbip({ legacyReport: true });
    writeFileSync(
      join(root, "Demo.Report", "definition.pbir"),
      j({ datasetReference: { byConnection: { connectionString: "x" } } }),
    );
    expect(refusal(join(root, "Demo.pbip"))).toEqual({
      message: report(`${root}/Demo.Report`),
      lines: [],
    });
  });
  it("refuses the one project below a plain folder when it is legacy, by its path below", () => {
    const root = tempDir("legacy-below");
    mkdirSync(join(root, "sub", "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "sub", "Demo.Report", "report.json"), "{}");
    expect(refusal(root)).toEqual({ message: report(`${root}/sub/Demo.Report`), lines: [] });
  });
  it("still lints a part read beside a legacy one, with the notice and the layer's reason", () => {
    const p = resolveProject(pbip({ model: true, legacyReport: true }));
    expect(p.model).toBeDefined();
    expect(p.absent).toEqual({ report: "the report is saved in the legacy report.json format" });
    expect(p.diagnostics.map((d) => d.kind)).toEqual(["legacy-report-format"]);
  });
});
