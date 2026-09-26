import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { EXPECTED_INPUT, resolveProject } from "../src/walk.js";

const repo = new URL("../../../", import.meta.url).pathname;
const j = (v: unknown) => JSON.stringify(v);

// The words for a .pbix (tracked in #88), written out here so a change to them is seen: Learn's
// labels, from the Power BI Desktop projects page.
const HOW =
  "pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, choose File > Save as and pick Power BI project files (*.pbip) as the file type (if it isn't offered, first turn on Power BI Project (.pbip) save option under File > Options and settings > Options > Preview features).";
const onePbix = (path: string): string =>
  `${path} is a Power BI Desktop file (.pbix), which pbiplint cannot read. ${HOW}`;
const manyPbix = (path: string, others: string): string =>
  `${path} and ${others} are Power BI Desktop files, which pbiplint cannot read. ${HOW}`;

/** A PBIP folder in a temp dir with the parts asked for. */
function pbip(parts: {
  model?: boolean;
  report?: boolean;
  pbir?: unknown;
  legacyReport?: boolean;
  legacyModel?: boolean;
  secondReport?: boolean;
}) {
  const root = mkdtempSync(join(tmpdir(), "pbiplint-"));
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
  const root = mkdtempSync(join(tmpdir(), "pbiplint-workspace-"));
  for (const name of ["Cost", "Sales"]) {
    pbipAt(join(root, `${name}.pbip`), [`${name}.Report`]);
    modelAt(join(root, `${name}.SemanticModel`), name);
    reportAt(join(root, `${name}.Report`), { byPath: { path: `../${name}.SemanticModel` } });
  }
  return root;
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
    expect(lone.absent).toEqual({});
    const def = resolveProject(join(root, "Demo.Report", "definition"));
    expect(def.report!.root).toBe(join(root, "Demo.Report"));
    expect(def.report!.files.map((f) => f.path)).toContain("definition/report.json");
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
          "Demo.Report is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop",
      },
    ]);
    const bim = resolveProject(pbip({ legacyModel: true, report: true }));
    expect(bim.model).toBeUndefined();
    expect(bim.absent.model).toBe("the model is saved in the legacy model.bim format");
    expect(bim.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
    const only = resolveProject(join(pbip({ legacyModel: true }), "Demo.SemanticModel"));
    expect(only.model).toBeUndefined();
    expect(only.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
  });
  it("refuses two reports or two models by name and explains what it could not find", () => {
    expect(() => resolveProject(pbip({ report: true, secondReport: true }))).toThrow(
      /contains 2 reports; point at one of them: Demo\.Report, Other\.Report/,
    );
    const empty = mkdtempSync(join(tmpdir(), "pbiplint-empty-"));
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
  });
  it("follows definition.pbir to a model outside the .pbip's folder", () => {
    const top = mkdtempSync(join(tmpdir(), "pbiplint-outside-"));
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
          "Cost.Report is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop",
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

describe("resolveProject and a .pbix (tracked in #88)", () => {
  const folder = (): string => mkdtempSync(join(tmpdir(), "pbiplint-pbix-"));
  it("names a .pbix given as the input, in any case, and says how to save it as a project", () => {
    const root = folder();
    for (const name of ["Sales.pbix", "Sales.PBIX"]) {
      const file = join(root, name);
      writeFileSync(file, "");
      expect(() => resolveProject(file)).toThrow(new Error(onePbix(file)));
    }
    // One that is not there is still named as not there.
    const gone = join(root, "Gone.pbix");
    expect(() => resolveProject(gone)).toThrow(new Error(`${gone} does not exist`));
  });
  it("names the .pbix a folder holds when it holds nothing to lint, joined to the input", () => {
    const root = folder();
    writeFileSync(join(root, "Sales.pbix"), "");
    expect(() => resolveProject(root)).toThrow(new Error(onePbix(`${root}/Sales.pbix`)));
    // In a folder below the input, and in capitals.
    const deep = folder();
    mkdirSync(join(deep, "Archive"));
    writeFileSync(join(deep, "Archive", "Sales.PBIX"), "");
    expect(() => resolveProject(deep)).toThrow(new Error(onePbix(`${deep}/Archive/Sales.PBIX`)));
  });
  it("names the first .pbix its walk meets and counts the others", () => {
    // Each folder's entries in name order, a folder's contents where its name sorts: Archive is
    // walked before Sales.pbix, and in it 2024.pbix is met before Old.pbix.
    const root = folder();
    writeFileSync(join(root, "Sales.pbix"), "");
    mkdirSync(join(root, "Archive"));
    writeFileSync(join(root, "Archive", "Old.pbix"), "");
    expect(() => resolveProject(root)).toThrow(
      new Error(manyPbix(`${root}/Archive/Old.pbix`, "1 other .pbix file")),
    );
    writeFileSync(join(root, "Archive", "2024.pbix"), "");
    expect(() => resolveProject(root)).toThrow(
      new Error(manyPbix(`${root}/Archive/2024.pbix`, "2 other .pbix files")),
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
    const legacy = pbip({ legacyReport: true });
    const notice = resolveProject(legacy);
    expect(notice.diagnostics.map((d) => d.kind)).toEqual(["legacy-report-format"]);
    writeFileSync(join(legacy, "Demo.pbix"), "");
    expect(resolveProject(legacy)).toEqual(notice);
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
  it("names a .pbix in the folder a .pbip that names no report is read as", () => {
    const root = folder();
    pbipAt(join(root, "Demo.pbip"), []);
    writeFileSync(join(root, "Demo.pbix"), "");
    expect(() => resolveProject(join(root, "Demo.pbip"))).toThrow(
      new Error(onePbix(`${root}/Demo.pbix`)),
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
      const top = mkdtempSync(join(tmpdir(), "pbiplint-outside-locked-"));
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
      const root = mkdtempSync(join(tmpdir(), "pbiplint-first-refused-"));
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
      const root = mkdtempSync(join(tmpdir(), "pbiplint-pbix-locked-"));
      const file = join(root, "Sales.pbix");
      writeFileSync(file, "");
      expect(() => locked([file], () => resolveProject(file))).toThrow(new Error(onePbix(file)));
      expect(() => locked([file], () => resolveProject(root))).toThrow(
        new Error(onePbix(`${root}/Sales.pbix`)),
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
