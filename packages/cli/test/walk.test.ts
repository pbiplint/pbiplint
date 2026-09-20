import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProject } from "../src/walk.js";

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
  it("turns the two legacy formats into diagnostics with the layer absent", () => {
    const legacy = resolveProject(pbip({ model: true, legacyReport: true }));
    expect(legacy.model).toBeDefined();
    expect(legacy.report).toBeUndefined();
    expect(legacy.absent.report).toBe("saved in the legacy report.json format");
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
    expect(bim.absent.model).toBe("saved in the legacy model.bim format");
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
